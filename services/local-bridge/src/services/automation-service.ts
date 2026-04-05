import { randomUUID } from "node:crypto";

import type {
  AutomationRule,
  GoalAutomationRule,
  GoalAutomationRuleDefinition,
  GoalAutomationRuleInput,
  GoalAutomationRunRecord,
  GoalAutomationRunState,
  Session,
} from "@relay/shared-types";

import { MemoryStore } from "@relay/memory-core";
import { CodexAppServerService } from "./codex-app-server";
import { GoalAutomationExecutor, createIdleGoalRunState } from "./goal-automation-executor";
import { RelayStateStore } from "./relay-state-store";
import { RuntimeEventBus } from "./runtime-event-bus";
import { SessionStore } from "./session-store";
import { TimelineMemoryService } from "./timeline-memory-service";
import { WorkspaceStore } from "./workspace-store";

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
  private readonly timelineMemoryService?: TimelineMemoryService;
  private readonly goalAutomationExecutor: GoalAutomationExecutor;
  private readonly runningActionRuleIds = new Set<string>();

  constructor(dependencies: AutomationServiceDependencies) {
    this.workspaceStore = dependencies.workspaceStore;
    this.memoryStore = dependencies.memoryStore;
    this.relayStateStore = dependencies.relayStateStore;
    this.sessionStore = dependencies.sessionStore;
    this.timelineMemoryService = dependencies.timelineMemoryService;
    this.goalAutomationExecutor = new GoalAutomationExecutor({
      relayStateStore: dependencies.relayStateStore,
      workspaceStore: dependencies.workspaceStore,
      sessionStore: dependencies.sessionStore,
      codexAppServerService: dependencies.codexAppServerService,
      runtimeEventBus: dependencies.runtimeEventBus,
      onSessionUpdated: (sessionId) => this.handleSessionUpdated(sessionId),
    });
  }

  listActiveWorkspaceRules(): AutomationRule[] {
    const workspace = this.workspaceStore.getActive();

    if (!workspace) {
      return [];
    }

    return this.relayStateStore
      .listInternalAutomationRules(workspace.id)
      .map((rule) => this.mapGoalRule(rule))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createGoalRule(input: GoalAutomationRuleInput) {
    const workspace = this.resolveWorkspace(input.workspaceId);
    const now = new Date().toISOString();
    const actionType = normalizeActionType(input.actionType);
    const triggerKind = normalizeTriggerKind(input.triggerKind);
    const targetSessionMode = normalizeTargetSessionMode(actionType, triggerKind, input.targetSessionMode);
    const goal = normalizeGoal(actionType, input.goal);
    const title = normalizeTitle(input.title, actionType, goal);
    const rule: GoalAutomationRuleDefinition = {
      id: randomUUID(),
      kind: "goal-loop",
      actionType,
      trigger: {
        kind: triggerKind,
        turnInterval: normalizeTriggerTurnInterval(triggerKind, input.triggerTurnInterval),
      },
      title,
      goal,
      acceptanceCriteria: normalizeAcceptanceCriteria(actionType, input.acceptanceCriteria),
      status: normalizeStatus(input.status),
      workspaceId: workspace.id,
      targetSessionMode,
      targetSessionId: normalizeTargetSessionId(targetSessionMode, input.targetSessionId),
      targetSessionTitle: this.resolveTargetSessionTitle(
        workspace.id,
        targetSessionMode,
        input.targetSessionId ?? null,
        input.targetSessionTitle ?? null,
        title,
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
    if (this.isRuleRunning(ruleId)) {
      throw new Error("Stop the automation before editing it");
    }

    const current = this.requireGoalRule(ruleId);
    const workspace = this.resolveWorkspace(input.workspaceId ?? current.workspaceId);
    const actionType = normalizeActionType(input.actionType ?? current.actionType);
    const triggerKind = normalizeTriggerKind(input.triggerKind ?? current.trigger.kind);
    const targetSessionMode = normalizeTargetSessionMode(
      actionType,
      triggerKind,
      input.targetSessionMode ?? current.targetSessionMode,
    );
    const goal = normalizeGoal(actionType, input.goal ?? current.goal);
    const title = normalizeTitle(input.title ?? current.title, actionType, goal);
    const updated: GoalAutomationRuleDefinition = {
      ...current,
      actionType,
      trigger: {
        kind: triggerKind,
        turnInterval: normalizeTriggerTurnInterval(triggerKind, input.triggerTurnInterval ?? current.trigger.turnInterval),
      },
      title,
      goal,
      acceptanceCriteria: normalizeAcceptanceCriteria(actionType, input.acceptanceCriteria ?? current.acceptanceCriteria),
      status: normalizeStatus(input.status ?? current.status),
      workspaceId: workspace.id,
      targetSessionMode,
      targetSessionId: normalizeTargetSessionId(targetSessionMode, input.targetSessionId ?? current.targetSessionId),
      targetSessionTitle: this.resolveTargetSessionTitle(
        workspace.id,
        targetSessionMode,
        input.targetSessionId ?? current.targetSessionId,
        input.targetSessionTitle ?? current.targetSessionTitle,
        title,
      ),
      maxTurns: clampNumber(input.maxTurns, 1, 50, current.maxTurns),
      maxDurationMinutes: clampNumber(input.maxDurationMinutes, 5, 720, current.maxDurationMinutes),
      updatedAt: new Date().toISOString(),
    };

    this.relayStateStore.saveInternalAutomationRule(updated);
    return this.mapGoalRule(updated);
  }

  deleteRule(ruleId: string) {
    if (this.isRuleRunning(ruleId)) {
      throw new Error("Stop the automation before deleting it");
    }

    const rule = this.relayStateStore.getInternalAutomationRule(ruleId);
    if (!rule) {
      throw new Error("Automation not found");
    }

    this.relayStateStore.deleteInternalAutomationRule(ruleId);
    return true;
  }

  async startRule(ruleId: string) {
    const rule = this.requireGoalRule(ruleId);

    if (rule.actionType === "continue-session") {
      this.goalAutomationExecutor.start(rule);
      return this.mapGoalRule(rule);
    }

    await this.executeGenerateTimelineMemoryRule(rule, "manual");
    return this.mapGoalRule(this.requireGoalRule(ruleId));
  }

  stopRule(ruleId: string) {
    const rule = this.requireGoalRule(ruleId);

    if (rule.actionType !== "continue-session") {
      throw new Error("This automation does not support stop");
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

  async handleSessionUpdated(sessionId: string) {
    const session = this.workspaceStore.getSessionDetailSnapshot(sessionId);

    if (!session) {
      return;
    }

    const rules = this.relayStateStore
      .listInternalAutomationRules(session.workspaceId)
      .filter((rule) => shouldTriggerOnSessionTurn(rule, session, this.getGoalRunState(rule.id)));

    for (const rule of rules) {
      if (this.isRuleRunning(rule.id)) {
        continue;
      }

      if (rule.actionType === "continue-session") {
        this.markRuleTriggered(rule.id, session);
        this.goalAutomationExecutor.start(rule);
        continue;
      }

      await this.executeGenerateTimelineMemoryRule(rule, "turn-interval", session);
    }
  }

  private async executeGenerateTimelineMemoryRule(
    rule: GoalAutomationRuleDefinition,
    source: "manual" | "turn-interval",
    resolvedSession?: Session,
  ) {
    if (!this.timelineMemoryService) {
      throw new Error("Timeline memory service is unavailable");
    }

    if (this.runningActionRuleIds.has(rule.id)) {
      return;
    }

    this.runningActionRuleIds.add(rule.id);

    try {
      const session = resolvedSession ?? this.resolveSession(rule.workspaceId, rule.targetSessionId);

      if (!session) {
        throw new Error("Target session not found");
      }

      if (session.turnCount <= 0) {
        throw new Error("Target session has no turns yet");
      }

      const checkpointTurnCount = session.turnCount;
      const existing = this.memoryStore.getByCheckpoint(session.id, checkpointTurnCount);
      const item = await this.timelineMemoryService.generateForSession(session.id, { manual: true });
      const finishedAt = new Date().toISOString();
      const summary =
        existing
          ? `Turn ${checkpointTurnCount} already has a timeline memory checkpoint.`
          : item
            ? `Generated timeline memory at turn ${checkpointTurnCount}.`
            : `Failed to generate timeline memory at turn ${checkpointTurnCount}.`;
      const status = item || existing ? "completed" : "failed";
      const stopReason = item || existing ? "completed" : "failed";
      const step = createSimpleActionStep({
        prompt:
          source === "manual"
            ? `Manually run the "${rule.title}" rule.`
            : `Session reached turn ${checkpointTurnCount}; run the "${rule.title}" rule.`,
        reason: summary,
        createdAt: finishedAt,
      });
      const currentState = this.getGoalRunState(rule.id);
      const runRecord: GoalAutomationRunRecord = {
        id: randomUUID(),
        ruleId: rule.id,
        status,
        stopReason,
        startedAt: finishedAt,
        updatedAt: finishedAt,
        finishedAt,
        summary,
        output: step.prompt,
        turnsCompleted: 1,
        sessionId: session.id,
        sessionTitle: session.title,
        lastEvaluationReason: summary,
        lastAssistantSummary: item ? item.title : null,
        lastError: item || existing ? null : summary,
        steps: [step],
      };

      this.relayStateStore.saveInternalAutomationRunState({
        ...currentState,
        runStatus: status,
        updatedAt: finishedAt,
        finishedAt,
        currentTurnCount: 0,
        stopReason,
        lastEvaluationReason: summary,
        lastAssistantSummary: item ? item.title : null,
        lastError: item || existing ? null : summary,
        latestRunId: runRecord.id,
        latestUserPrompt: null,
        lastTriggeredTurnCount: checkpointTurnCount,
        sessionId: session.id,
        sessionTitle: session.title,
        recentRuns: [runRecord, ...currentState.recentRuns.filter((existingRun) => existingRun.id !== runRecord.id)].slice(0, 10),
      });
    } finally {
      this.runningActionRuleIds.delete(rule.id);
    }
  }

  private markRuleTriggered(ruleId: string, session: Session) {
    const currentState = this.getGoalRunState(ruleId);
    this.relayStateStore.saveInternalAutomationRunState({
      ...currentState,
      updatedAt: new Date().toISOString(),
      lastTriggeredTurnCount: session.turnCount,
      sessionId: session.id,
      sessionTitle: session.title,
    });
  }

  private mapGoalRule(rule: GoalAutomationRuleDefinition): GoalAutomationRule {
    const runState = this.getGoalRunState(rule.id);
    const isRunning = this.isRuleRunning(rule.id);
    const latestRun = runState.recentRuns[0] ?? null;
    const isLongRunningAction = rule.actionType === "continue-session";

    return {
      id: rule.id,
      kind: "goal-loop",
      source: "relay",
      title: rule.title,
      summary: createRuleSummary(rule),
      status: rule.status,
      workspaceId: rule.workspaceId,
      sessionId: runState.sessionId ?? rule.targetSessionId,
      sessionTitle: runState.sessionTitle ?? rule.targetSessionTitle,
      actionType: rule.actionType,
      trigger: rule.trigger,
      goal: rule.goal,
      acceptanceCriteria: rule.acceptanceCriteria,
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
        canStop: isLongRunningAction && this.goalAutomationExecutor.isRunning(rule.id),
      },
    };
  }

  private getGoalRunState(ruleId: string): GoalAutomationRunState {
    const current = this.relayStateStore.getInternalAutomationRunState(ruleId) ?? createIdleGoalRunState(ruleId);

    if (
      current.runStatus === "running" &&
      !this.goalAutomationExecutor.isRunning(ruleId) &&
      !this.runningActionRuleIds.has(ruleId)
    ) {
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

  private isRuleRunning(ruleId: string) {
    return this.goalAutomationExecutor.isRunning(ruleId) || this.runningActionRuleIds.has(ruleId);
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
    mode: GoalAutomationRuleDefinition["targetSessionMode"],
    sessionId: string | null,
    fallbackTitle: string | null | undefined,
    title: string,
  ) {
    if (mode === "new-session") {
      const nextTitle = fallbackTitle?.trim() || title;
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

    const snapshotList = this.workspaceStore.getSessionListSnapshot(workspaceId);
    return snapshotList?.items.find((item) => item.id === sessionId) ?? null;
  }
}

function createRuleSummary(rule: GoalAutomationRuleDefinition) {
  if (rule.actionType === "generate-timeline-memory") {
    if (rule.trigger.kind === "turn-interval" && rule.trigger.turnInterval) {
      return `Generate a timeline memory every ${rule.trigger.turnInterval} turns.`;
    }

    return "Generate a timeline memory for the bound session.";
  }

  return rule.goal ?? "Continue the bound session until the goal is complete.";
}

function createSimpleActionStep(input: {
  prompt: string;
  reason: string;
  createdAt: string;
}) {
  return {
    turnNumber: 1,
    prompt: input.prompt,
    assistantReply: null,
    evaluationDone: true,
    evaluationReason: input.reason,
    nextUserPrompt: null,
    createdAt: input.createdAt,
    completedAt: input.createdAt,
  };
}

function shouldTriggerOnSessionTurn(
  rule: GoalAutomationRuleDefinition,
  session: Session,
  runState: GoalAutomationRunState,
) {
  if (rule.status !== "active") {
    return false;
  }

  if (rule.trigger.kind !== "turn-interval") {
    return false;
  }

  if (rule.targetSessionMode !== "existing-session" || rule.targetSessionId !== session.id) {
    return false;
  }

  const interval = rule.trigger.turnInterval ?? 0;
  if (interval <= 0 || session.turnCount <= 0 || session.turnCount % interval !== 0) {
    return false;
  }

  return runState.lastTriggeredTurnCount !== session.turnCount;
}

function normalizeActionType(value?: string | null): GoalAutomationRuleDefinition["actionType"] {
  return value === "generate-timeline-memory" ? "generate-timeline-memory" : "continue-session";
}

function normalizeTriggerKind(value?: string | null): GoalAutomationRuleDefinition["trigger"]["kind"] {
  return value === "turn-interval" ? "turn-interval" : "manual";
}

function normalizeTitle(
  title: string | undefined,
  actionType: GoalAutomationRuleDefinition["actionType"],
  goal: string | null,
) {
  const fallback = actionType === "generate-timeline-memory" ? "Timeline Memory Rule" : goal ?? "";
  const value = title?.trim() || fallback.trim();

  if (!value) {
    throw new Error("Missing automation title");
  }

  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
}

function normalizeGoal(
  actionType: GoalAutomationRuleDefinition["actionType"],
  goal: string | null | undefined,
) {
  if (actionType === "generate-timeline-memory") {
    return null;
  }

  const value = goal?.trim();
  if (!value) {
    throw new Error("Missing automation goal");
  }

  return value;
}

function normalizeAcceptanceCriteria(
  actionType: GoalAutomationRuleDefinition["actionType"],
  value?: string | null,
) {
  if (actionType !== "continue-session") {
    return null;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeStatus(status?: "active" | "paused") {
  return status === "paused" ? "paused" : "active";
}

function normalizeTargetSessionMode(
  actionType: GoalAutomationRuleDefinition["actionType"],
  triggerKind: GoalAutomationRuleDefinition["trigger"]["kind"],
  mode?: GoalAutomationRuleInput["targetSessionMode"] | null,
) {
  if (actionType === "generate-timeline-memory" || triggerKind === "turn-interval") {
    return "existing-session";
  }

  return mode === "existing-session" ? "existing-session" : "new-session";
}

function normalizeTargetSessionId(
  mode: GoalAutomationRuleDefinition["targetSessionMode"],
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

function normalizeTriggerTurnInterval(
  triggerKind: GoalAutomationRuleDefinition["trigger"]["kind"],
  value: number | null | undefined,
) {
  if (triggerKind !== "turn-interval") {
    return null;
  }

  return clampNumber(value ?? 1, 1, 200, 1);
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export { AutomationService, DEFAULT_MAX_DURATION_MINUTES, DEFAULT_MAX_TURNS };
