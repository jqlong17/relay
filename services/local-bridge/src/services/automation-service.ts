import { randomUUID } from "node:crypto";

import type {
  AutomationRule,
  GoalAutomationRule,
  GoalAutomationRuleDefinition,
  GoalAutomationRuleInput,
  GoalAutomationRunRecord,
  GoalAutomationRunState,
  Session,
  TimelineMemoryCheckpointAutomationRule,
} from "@relay/shared-types";

import { MemoryStore } from "@relay/memory-core";
import { CodexAppServerService } from "./codex-app-server";
import { GoalAutomationExecutor, createIdleGoalRunState } from "./goal-automation-executor";
import { RelayStateStore } from "./relay-state-store";
import { RuntimeEventBus } from "./runtime-event-bus";
import { SessionStore } from "./session-store";
import { TimelineMemoryService } from "./timeline-memory-service";
import { WorkspaceStore } from "./workspace-store";

const TIMELINE_MEMORY_AUTOMATION_ID = "timeline-memory-turn-checkpoint";
const TIMELINE_MEMORY_INTERVAL_TURNS = 20;
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_MAX_DURATION_MINUTES = 120;

type AutomationServiceDependencies = {
  workspaceStore: WorkspaceStore;
  memoryStore: MemoryStore;
  relayStateStore: RelayStateStore;
  sessionStore: SessionStore;
  codexAppServerService: CodexAppServerService;
  runtimeEventBus?: RuntimeEventBus;
  timelineMemoryService?: TimelineMemoryService;
};

class AutomationService {
  private readonly workspaceStore: WorkspaceStore;
  private readonly memoryStore: MemoryStore;
  private readonly relayStateStore: RelayStateStore;
  private readonly sessionStore: SessionStore;
  private readonly goalAutomationExecutor: GoalAutomationExecutor;

  constructor(dependencies: AutomationServiceDependencies) {
    this.workspaceStore = dependencies.workspaceStore;
    this.memoryStore = dependencies.memoryStore;
    this.relayStateStore = dependencies.relayStateStore;
    this.sessionStore = dependencies.sessionStore;
    this.goalAutomationExecutor = new GoalAutomationExecutor({
      relayStateStore: dependencies.relayStateStore,
      workspaceStore: dependencies.workspaceStore,
      sessionStore: dependencies.sessionStore,
      codexAppServerService: dependencies.codexAppServerService,
      runtimeEventBus: dependencies.runtimeEventBus,
      timelineMemoryService: dependencies.timelineMemoryService,
    });
  }

  listActiveWorkspaceRules(): AutomationRule[] {
    const workspace = this.workspaceStore.getActive();

    if (!workspace) {
      return [];
    }

    const systemRule = this.buildTimelineCheckpointRule(workspace.id);
    const goalRules = this.relayStateStore
      .listInternalAutomationRules(workspace.id)
      .map((rule) => this.mapGoalRule(rule))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return [systemRule, ...goalRules];
  }

  createGoalRule(input: GoalAutomationRuleInput) {
    const workspace = this.resolveWorkspace(input.workspaceId);
    const now = new Date().toISOString();
    const rule: GoalAutomationRuleDefinition = {
      id: randomUUID(),
      kind: "goal-loop",
      title: normalizeTitle(input.title, input.goal),
      goal: normalizeGoal(input.goal),
      status: normalizeStatus(input.status),
      workspaceId: workspace.id,
      targetSessionMode: input.targetSessionMode,
      targetSessionId: normalizeTargetSessionId(input.targetSessionMode, input.targetSessionId),
      targetSessionTitle: this.resolveTargetSessionTitle(
        workspace.id,
        input.targetSessionMode,
        input.targetSessionId ?? null,
        input.targetSessionTitle ?? null,
        input.title,
        input.goal,
      ),
      maxTurns: clampNumber(input.maxTurns, 1, 50, DEFAULT_MAX_TURNS),
      maxDurationMinutes: clampNumber(input.maxDurationMinutes, 5, 720, DEFAULT_MAX_DURATION_MINUTES),
      createdAt: now,
      updatedAt: now,
    };

    this.relayStateStore.saveInternalAutomationRule(rule);
    this.relayStateStore.saveInternalAutomationRunState(createIdleGoalRunState(rule.id));

    return this.mapGoalRule(rule);
  }

  updateGoalRule(ruleId: string, input: GoalAutomationRuleInput) {
    if (this.goalAutomationExecutor.isRunning(ruleId)) {
      throw new Error("Stop the automation before editing it");
    }

    const current = this.requireGoalRule(ruleId);
    const workspace = this.resolveWorkspace(input.workspaceId ?? current.workspaceId);
    const updated: GoalAutomationRuleDefinition = {
      ...current,
      title: normalizeTitle(input.title, input.goal),
      goal: normalizeGoal(input.goal),
      status: normalizeStatus(input.status ?? current.status),
      workspaceId: workspace.id,
      targetSessionMode: input.targetSessionMode,
      targetSessionId: normalizeTargetSessionId(input.targetSessionMode, input.targetSessionId),
      targetSessionTitle: this.resolveTargetSessionTitle(
        workspace.id,
        input.targetSessionMode,
        input.targetSessionId ?? null,
        input.targetSessionTitle ?? current.targetSessionTitle,
        input.title,
        input.goal,
      ),
      maxTurns: clampNumber(input.maxTurns, 1, 50, current.maxTurns),
      maxDurationMinutes: clampNumber(input.maxDurationMinutes, 5, 720, current.maxDurationMinutes),
      updatedAt: new Date().toISOString(),
    };

    this.relayStateStore.saveInternalAutomationRule(updated);
    return this.mapGoalRule(updated);
  }

  deleteRule(ruleId: string) {
    if (ruleId === TIMELINE_MEMORY_AUTOMATION_ID) {
      throw new Error("System automation cannot be deleted");
    }

    if (this.goalAutomationExecutor.isRunning(ruleId)) {
      throw new Error("Stop the automation before deleting it");
    }

    const rule = this.relayStateStore.getInternalAutomationRule(ruleId);
    if (!rule) {
      throw new Error("Automation not found");
    }

    this.relayStateStore.deleteInternalAutomationRule(ruleId);
    return true;
  }

  startRule(ruleId: string) {
    if (ruleId === TIMELINE_MEMORY_AUTOMATION_ID) {
      throw new Error("System automation cannot be started manually");
    }

    const rule = this.requireGoalRule(ruleId);
    this.goalAutomationExecutor.start(rule);
    return this.mapGoalRule(rule);
  }

  stopRule(ruleId: string) {
    if (ruleId === TIMELINE_MEMORY_AUTOMATION_ID) {
      throw new Error("System automation cannot be stopped manually");
    }

    const stopped = this.goalAutomationExecutor.stop(ruleId);

    if (!stopped) {
      throw new Error("Automation is not running");
    }

    const runState = this.relayStateStore.getInternalAutomationRunState(ruleId);
    if (runState) {
      this.relayStateStore.saveInternalAutomationRunState({
        ...runState,
        updatedAt: new Date().toISOString(),
        lastEvaluationReason:
          runState.lastEvaluationReason ?? "Stop requested. Waiting for the current turn to finish.",
      });
    }

    return this.mapGoalRule(this.requireGoalRule(ruleId));
  }

  listGoalRuns(ruleId: string, limit = 10): GoalAutomationRunRecord[] {
    const rule = this.requireGoalRule(ruleId);
    const runState = this.relayStateStore.getInternalAutomationRunState(rule.id);
    return (runState?.recentRuns ?? []).slice(0, Math.max(1, limit));
  }

  private buildTimelineCheckpointRule(workspaceId: string): TimelineMemoryCheckpointAutomationRule {
    const session = this.getReferenceSession(workspaceId);
    const workspaceMemories = this.memoryStore.listByWorkspaceId(workspaceId);
    const latestCheckpointMemory = workspaceMemories.find(
      (item) => item.checkpointTurnCount > 0 && item.checkpointTurnCount % TIMELINE_MEMORY_INTERVAL_TURNS === 0,
    );

    const currentTurnCount = session?.turnCount ?? null;
    const currentCheckpoint =
      currentTurnCount === null ? null : Math.floor(currentTurnCount / TIMELINE_MEMORY_INTERVAL_TURNS) * TIMELINE_MEMORY_INTERVAL_TURNS;
    const hasCompletedCurrentCheckpoint =
      session && currentCheckpoint
        ? workspaceMemories.some(
            (item) => item.sessionId === session.id && item.checkpointTurnCount === currentCheckpoint,
          )
        : false;
    const nextCheckpointTurnCount =
      currentTurnCount === null
        ? null
        : currentTurnCount === 0
          ? TIMELINE_MEMORY_INTERVAL_TURNS
          : currentTurnCount % TIMELINE_MEMORY_INTERVAL_TURNS === 0
            ? hasCompletedCurrentCheckpoint
              ? currentTurnCount + TIMELINE_MEMORY_INTERVAL_TURNS
              : currentTurnCount
            : currentTurnCount + (TIMELINE_MEMORY_INTERVAL_TURNS - (currentTurnCount % TIMELINE_MEMORY_INTERVAL_TURNS));
    const turnsUntilNextRun =
      currentTurnCount === null || nextCheckpointTurnCount === null ? null : nextCheckpointTurnCount - currentTurnCount;

    return {
      id: TIMELINE_MEMORY_AUTOMATION_ID,
      kind: "timeline-memory-checkpoint",
      source: "relay",
      title: "按轮次自动整理",
      summary: "每 20 轮对话自动生成 timeline memory。",
      status: "active",
      workspaceId,
      sessionId: session?.id ?? null,
      sessionTitle: session?.title ?? null,
      intervalTurns: TIMELINE_MEMORY_INTERVAL_TURNS,
      currentTurnCount,
      turnsUntilNextRun,
      nextCheckpointTurnCount,
      lastRunAt: latestCheckpointMemory?.createdAt ?? null,
      createdAt: latestCheckpointMemory?.createdAt ?? new Date().toISOString(),
      updatedAt: latestCheckpointMemory?.updatedAt ?? new Date().toISOString(),
      capabilities: {
        canEdit: false,
        canDelete: false,
        canRun: false,
        canStop: false,
      },
    };
  }

  private mapGoalRule(rule: GoalAutomationRuleDefinition): GoalAutomationRule {
    const runState = this.getGoalRunState(rule.id);
    const isRunning = this.goalAutomationExecutor.isRunning(rule.id);
    const latestRun = runState.recentRuns[0] ?? null;

    return {
      id: rule.id,
      kind: "goal-loop",
      source: "relay",
      title: rule.title,
      summary: rule.goal,
      status: rule.status,
      workspaceId: rule.workspaceId,
      sessionId: runState.sessionId ?? rule.targetSessionId,
      sessionTitle: runState.sessionTitle ?? rule.targetSessionTitle,
      goal: rule.goal,
      trigger: "manual",
      targetSessionMode: rule.targetSessionMode,
      maxTurns: rule.maxTurns,
      maxDurationMinutes: rule.maxDurationMinutes,
      runStatus: isRunning ? "running" : runState.runStatus,
      currentTurnCount: runState.currentTurnCount,
      stopReason: runState.stopReason,
      lastEvaluationReason: runState.lastEvaluationReason,
      lastAssistantSummary: runState.lastAssistantSummary,
      lastError: runState.lastError,
      latestRunId: runState.latestRunId,
      lastRunAt: latestRun?.finishedAt ?? runState.finishedAt ?? runState.updatedAt,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      capabilities: {
        canEdit: !isRunning,
        canDelete: !isRunning,
        canRun: !isRunning,
        canStop: isRunning,
      },
    };
  }

  private getGoalRunState(ruleId: string): GoalAutomationRunState {
    const current = this.relayStateStore.getInternalAutomationRunState(ruleId) ?? createIdleGoalRunState(ruleId);

    if (current.runStatus === "running" && !this.goalAutomationExecutor.isRunning(ruleId)) {
      const normalized: GoalAutomationRunState = {
        ...current,
        runStatus: "failed",
        updatedAt: new Date().toISOString(),
        finishedAt: current.finishedAt ?? new Date().toISOString(),
        stopReason: "failed",
        lastError:
          current.lastError ??
          "Automation was interrupted because Relay restarted before the run could finish.",
      };
      this.relayStateStore.saveInternalAutomationRunState(normalized);
      return normalized;
    }

    return current;
  }

  private requireGoalRule(ruleId: string) {
    const rule = this.relayStateStore.getInternalAutomationRule(ruleId);

    if (!rule) {
      throw new Error("Automation not found");
    }

    return rule;
  }

  private resolveWorkspace(workspaceId?: string | null) {
    if (workspaceId) {
      const explicitWorkspace = this.workspaceStore.get(workspaceId);
      if (explicitWorkspace) {
        return explicitWorkspace;
      }
    }

    const activeWorkspace = this.workspaceStore.getActive();
    if (!activeWorkspace) {
      throw new Error("No active workspace");
    }

    return activeWorkspace;
  }

  private resolveTargetSessionTitle(
    workspaceId: string,
    mode: GoalAutomationRuleInput["targetSessionMode"],
    sessionId: string | null,
    fallbackTitle: string | null | undefined,
    title: string,
    goal: string,
  ) {
    if (mode === "new-session") {
      const nextTitle = fallbackTitle?.trim() || normalizeTitle(title, goal);
      return nextTitle || "Goal Session";
    }

    const session = this.resolveSession(workspaceId, sessionId);
    return session?.title ?? fallbackTitle?.trim() ?? null;
  }

  private resolveSession(workspaceId: string, sessionId: string | null | undefined) {
    if (!sessionId) {
      return null;
    }

    const inMemoryDraft = this.sessionStore.get(sessionId);
    if (inMemoryDraft) {
      return inMemoryDraft;
    }

    const snapshotSession = this.workspaceStore.getSessionDetailSnapshot(sessionId);
    if (snapshotSession) {
      return snapshotSession;
    }

    const listSnapshotSession = this.getSessionFromSnapshots(workspaceId, sessionId);
    if (listSnapshotSession) {
      return listSnapshotSession;
    }

    return null;
  }

  private getSessionFromSnapshots(workspaceId: string, sessionId: string) {
    const snapshotList = this.workspaceStore.getSessionListSnapshot(workspaceId);
    return snapshotList?.items.find((item) => item.id === sessionId) ?? null;
  }

  private getReferenceSession(workspaceId: string): Session | null {
    const preferredSessionId = this.workspaceStore.getPreferredSessionId(workspaceId);

    if (preferredSessionId) {
      const preferredSession = this.workspaceStore.getSessionDetailSnapshot(preferredSessionId);
      if (preferredSession) {
        return preferredSession;
      }
    }

    const sessionListSnapshot = this.workspaceStore.getSessionListSnapshot(workspaceId);
    return sessionListSnapshot?.items[0] ?? null;
  }
}

function normalizeTitle(title: string, goal: string) {
  const value = title.trim() || goal.trim();

  if (!value) {
    throw new Error("Missing automation title");
  }

  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
}

function normalizeGoal(goal: string) {
  const value = goal.trim();

  if (!value) {
    throw new Error("Missing automation goal");
  }

  return value;
}

function normalizeStatus(status?: "active" | "paused") {
  return status === "paused" ? "paused" : "active";
}

function normalizeTargetSessionId(
  mode: GoalAutomationRuleInput["targetSessionMode"],
  sessionId?: string | null,
) {
  if (mode === "existing-session") {
    if (!sessionId?.trim()) {
      throw new Error("Missing target session");
    }

    return sessionId.trim();
  }

  return null;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export { AutomationService, DEFAULT_MAX_DURATION_MINUTES, DEFAULT_MAX_TURNS, TIMELINE_MEMORY_AUTOMATION_ID, TIMELINE_MEMORY_INTERVAL_TURNS };
