import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  GoalAutomationRuleDefinition,
  GoalAutomationRunRecord,
  GoalAutomationRunState,
  GoalAutomationRunStatus,
  GoalAutomationRunStep,
  GoalAutomationStopReason,
} from "@relay/shared-types";

import {
  CodexAppServerService,
  type AppServerNotification,
  type AppServerThread,
  type AppServerTurn,
  type AppServerUserInput,
} from "./codex-app-server";
import { RelayStateStore } from "./relay-state-store";
import { RuntimeEventBus } from "./runtime-event-bus";
import { SessionStore } from "./session-store";
import { WorkspaceStore } from "./workspace-store";

type GoalAutomationExecutorDependencies = {
  relayStateStore: RelayStateStore;
  workspaceStore: WorkspaceStore;
  sessionStore: SessionStore;
  codexAppServerService: CodexAppServerService;
  runtimeEventBus?: RuntimeEventBus;
  onSessionUpdated?: (sessionId: string) => void | Promise<void>;
};

type GoalEvaluationResult = {
  done: boolean;
  reason: string;
  nextUserPrompt: string | null;
};

class GoalAutomationExecutor {
  private readonly runningControllers = new Map<string, AbortController>();

  private readonly relayStateStore: RelayStateStore;
  private readonly workspaceStore: WorkspaceStore;
  private readonly sessionStore: SessionStore;
  private readonly codexAppServerService: CodexAppServerService;
  private readonly runtimeEventBus?: RuntimeEventBus;
  private readonly onSessionUpdated?: (sessionId: string) => void | Promise<void>;

  constructor(dependencies: GoalAutomationExecutorDependencies) {
    this.relayStateStore = dependencies.relayStateStore;
    this.workspaceStore = dependencies.workspaceStore;
    this.sessionStore = dependencies.sessionStore;
    this.codexAppServerService = dependencies.codexAppServerService;
    this.runtimeEventBus = dependencies.runtimeEventBus;
    this.onSessionUpdated = dependencies.onSessionUpdated;
  }

  isRunning(ruleId: string) {
    return this.runningControllers.has(ruleId);
  }

  start(rule: GoalAutomationRuleDefinition) {
    if (rule.actionType !== "continue-session") {
      throw new Error("Unsupported automation action");
    }

    if (this.runningControllers.has(rule.id)) {
      throw new Error("Automation is already running");
    }

    const controller = new AbortController();
    this.runningControllers.set(rule.id, controller);

    void this.run(rule, controller.signal).finally(() => {
      this.runningControllers.delete(rule.id);
    });
  }

  stop(ruleId: string) {
    const controller = this.runningControllers.get(ruleId);

    if (!controller) {
      return false;
    }

    controller.abort();
    return true;
  }

  private async run(rule: GoalAutomationRuleDefinition, signal: AbortSignal) {
    if (!rule.goal) {
      throw new Error("Missing goal for continue-session automation");
    }

    const goal = rule.goal;
    const workspace = this.workspaceStore.get(rule.workspaceId);
    const baseRunState = this.relayStateStore.getInternalAutomationRunState(rule.id);
    const now = new Date().toISOString();
    const runId = randomUUID();
    const startedAtMs = Date.now();
    const steps: GoalAutomationRunStep[] = [];
    let currentPrompt = buildInitialGoalPrompt(goal, rule.acceptanceCriteria);
    let currentSessionId = rule.targetSessionId;
    let currentSessionTitle = rule.targetSessionTitle ?? deriveGoalSessionTitle(rule.title, goal);

    const runningState: GoalAutomationRunState = {
      ruleId: rule.id,
      runStatus: "running",
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      currentTurnCount: 0,
      stopReason: null,
      lastEvaluationReason: null,
      lastAssistantSummary: null,
      lastError: null,
      latestRunId: runId,
      latestUserPrompt: currentPrompt,
      lastTriggeredTurnCount: baseRunState?.lastTriggeredTurnCount ?? null,
      sessionId: currentSessionId,
      sessionTitle: currentSessionTitle,
      recentRuns: baseRunState?.recentRuns ?? [],
    };
    this.relayStateStore.saveInternalAutomationRunState(runningState);

    try {
      for (let turnNumber = 1; turnNumber <= rule.maxTurns; turnNumber += 1) {
        if (signal.aborted) {
          this.finishRun(rule.id, runningState, steps, "stopped", "stopped_by_user");
          return;
        }

        if (Date.now() - startedAtMs > rule.maxDurationMinutes * 60_000) {
          this.finishRun(rule.id, runningState, steps, "stopped", "max_duration_reached");
          return;
        }

        const stepStartedAt = new Date().toISOString();
        const turnResult = await this.runTargetTurn({
          workspaceId: rule.workspaceId,
          sessionId: currentSessionId,
          sessionTitle: currentSessionTitle,
          content: currentPrompt,
        });

        currentSessionId = turnResult.sessionId;
        currentSessionTitle = turnResult.sessionTitle;

        if (rule.targetSessionMode === "new-session" && rule.targetSessionId !== currentSessionId) {
          this.relayStateStore.saveInternalAutomationRule({
            ...rule,
            targetSessionId: currentSessionId,
            targetSessionTitle: currentSessionTitle,
            updatedAt: new Date().toISOString(),
          });
          rule = this.relayStateStore.getInternalAutomationRule(rule.id) ?? rule;
        }

        if (signal.aborted) {
          const stoppedStep = createGoalStep({
            turnNumber,
            prompt: currentPrompt,
            assistantReply: turnResult.assistantReply,
            evaluationDone: false,
            evaluationReason: "Stopped by user after the current turn completed.",
            nextUserPrompt: null,
            createdAt: stepStartedAt,
          });
          steps.push(stoppedStep);
          runningState.currentTurnCount = turnNumber;
          runningState.updatedAt = new Date().toISOString();
          runningState.lastAssistantSummary = summarizeAssistantReply(turnResult.assistantReply);
          runningState.latestUserPrompt = null;
          runningState.sessionId = currentSessionId;
          runningState.sessionTitle = currentSessionTitle;
          this.finishRun(rule.id, runningState, steps, "stopped", "stopped_by_user");
          return;
        }

        const evaluation = await this.evaluateGoal({
          workspacePath: workspace?.localPath ?? turnResult.workspacePath,
          goal,
          acceptanceCriteria: rule.acceptanceCriteria,
          maxTurns: rule.maxTurns,
          turnNumber,
          assistantReply: turnResult.assistantReply,
          steps,
        });

        const step = createGoalStep({
          turnNumber,
          prompt: currentPrompt,
          assistantReply: turnResult.assistantReply,
          evaluationDone: evaluation.done,
          evaluationReason: evaluation.reason,
          nextUserPrompt: evaluation.nextUserPrompt,
          createdAt: stepStartedAt,
        });
        steps.push(step);

        runningState.currentTurnCount = turnNumber;
        runningState.updatedAt = new Date().toISOString();
        runningState.lastEvaluationReason = evaluation.reason;
        runningState.lastAssistantSummary = summarizeAssistantReply(turnResult.assistantReply);
        runningState.latestUserPrompt = evaluation.nextUserPrompt;
        runningState.sessionId = currentSessionId;
        runningState.sessionTitle = currentSessionTitle;
        this.relayStateStore.saveInternalAutomationRunState({
          ...runningState,
        });

        if (evaluation.done) {
          this.finishRun(rule.id, runningState, steps, "completed", "completed");
          return;
        }

        if (Date.now() - startedAtMs > rule.maxDurationMinutes * 60_000) {
          this.finishRun(rule.id, runningState, steps, "stopped", "max_duration_reached");
          return;
        }

        if (turnNumber >= rule.maxTurns) {
          this.finishRun(rule.id, runningState, steps, "stopped", "max_turns_reached");
          return;
        }

        currentPrompt =
          evaluation.nextUserPrompt?.trim() ||
          buildFallbackContinuationPrompt(goal, rule.acceptanceCriteria, turnNumber);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Goal automation run failed";
      runningState.updatedAt = new Date().toISOString();
      runningState.lastError = message;
      this.finishRun(rule.id, runningState, steps, "failed", "failed");
    }
  }

  private finishRun(
    ruleId: string,
    currentState: GoalAutomationRunState,
    steps: GoalAutomationRunStep[],
    status: GoalAutomationRunStatus,
    stopReason: GoalAutomationStopReason,
  ) {
    const finishedAt = new Date().toISOString();
    const output = formatRunOutput(steps);
    const summary = createRunSummary(status, stopReason, currentState.lastEvaluationReason, currentState.lastError);
    const runRecord: GoalAutomationRunRecord = {
      id: currentState.latestRunId ?? randomUUID(),
      ruleId,
      status,
      stopReason,
      startedAt: currentState.startedAt ?? finishedAt,
      updatedAt: finishedAt,
      finishedAt,
      summary,
      output,
      turnsCompleted: currentState.currentTurnCount,
      sessionId: currentState.sessionId,
      sessionTitle: currentState.sessionTitle,
      lastEvaluationReason: currentState.lastEvaluationReason,
      lastAssistantSummary: currentState.lastAssistantSummary,
      lastError: currentState.lastError,
      steps,
    };

    const existingRuns = currentState.recentRuns.filter((item) => item.id !== runRecord.id);
    const nextState: GoalAutomationRunState = {
      ...currentState,
      runStatus: status,
      updatedAt: finishedAt,
      finishedAt,
      stopReason,
      recentRuns: [runRecord, ...existingRuns].slice(0, 10),
    };

    this.relayStateStore.saveInternalAutomationRunState(nextState);
  }

  private async runTargetTurn(input: {
    workspaceId: string;
    sessionId: string | null;
    sessionTitle: string | null;
    content: string;
  }) {
    const workspace = this.workspaceStore.get(input.workspaceId);

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const prepared = await this.ensureMaterializedSession(
      workspace.id,
      workspace.localPath,
      input.sessionId,
      input.sessionTitle,
    );
    const turn = await this.codexAppServerService.startTurnStream(
      prepared.sessionId,
      buildTurnInput(input.content),
    );
    const turnError = await consumeTurnNotifications(turn.notifications);

    if (turnError) {
      throw new Error(turnError);
    }

    const thread = await this.codexAppServerService.threadRead(prepared.sessionId, true);
    const resolvedWorkspaceId = this.workspaceStore.findByLocalPath(thread.cwd)?.id ?? input.workspaceId;
    persistMaterializedSessionSnapshots(this.workspaceStore, resolvedWorkspaceId, thread);
    this.workspaceStore.setPreferredSessionId(resolvedWorkspaceId, thread.id);
    publishThreadSyncEvents(this.runtimeEventBus, thread.id, resolvedWorkspaceId);
    void this.onSessionUpdated?.(thread.id);

    return {
      sessionId: thread.id,
      sessionTitle: thread.name?.trim() || deriveTitle(thread.preview),
      assistantReply: extractLatestAssistantReply(thread),
      workspacePath: thread.cwd,
    };
  }

  private async ensureMaterializedSession(
    workspaceId: string,
    workspacePath: string,
    sessionId: string | null,
    sessionTitle: string | null,
  ) {
    let resolvedSessionId = sessionId;

    if (!resolvedSessionId) {
      const draft = this.sessionStore.create(workspaceId, sessionTitle?.trim() || "Goal Session");
      resolvedSessionId = draft.id;
    }

    const draftSession = this.sessionStore.get(resolvedSessionId);
    if (!draftSession) {
      return {
        sessionId: resolvedSessionId,
      };
    }

    const thread = await this.codexAppServerService.threadStart({ cwd: workspacePath });
    await this.codexAppServerService.threadSetName(thread.id, draftSession.title);
    persistMaterializedSessionSnapshots(this.workspaceStore, workspaceId, {
      ...thread,
      name: draftSession.title,
    });
    this.sessionStore.remove(draftSession.id);
    this.workspaceStore.setPreferredSessionId(workspaceId, thread.id);

    return {
      sessionId: thread.id,
    };
  }

  private async evaluateGoal(input: {
    workspacePath: string;
    goal: string;
    acceptanceCriteria: string | null;
    maxTurns: number;
    turnNumber: number;
    assistantReply: string | null;
    steps: GoalAutomationRunStep[];
  }): Promise<GoalEvaluationResult> {
    const thread = await this.codexAppServerService.threadStart({ cwd: input.workspacePath });

    try {
      const turn = await this.codexAppServerService.startTurnStream(
        thread.id,
        buildTurnInput(
          createGoalEvaluationPrompt({
            goal: input.goal,
            acceptanceCriteria: input.acceptanceCriteria,
            maxTurns: input.maxTurns,
            turnNumber: input.turnNumber,
            assistantReply: input.assistantReply,
            steps: input.steps,
          }),
        ),
      );
      const turnError = await consumeTurnNotifications(turn.notifications);

      if (turnError) {
        throw new Error(turnError);
      }

      const evaluationThread = await this.codexAppServerService.threadRead(thread.id, true);
      const rawOutput = extractLatestAssistantReply(evaluationThread);
      const parsed = rawOutput ? parseGoalEvaluation(rawOutput) : null;

      if (parsed) {
        return parsed;
      }

      return {
        done: false,
        reason: "Evaluator returned invalid JSON. Continue with a concrete next step.",
        nextUserPrompt: buildFallbackContinuationPrompt(input.goal, input.acceptanceCriteria, input.turnNumber),
      };
    } finally {
      await this.codexAppServerService.threadArchive(thread.id).catch(() => {});
    }
  }
}

function createIdleGoalRunState(ruleId: string): GoalAutomationRunState {
  return {
    ruleId,
    runStatus: "idle",
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    currentTurnCount: 0,
    stopReason: null,
    lastEvaluationReason: null,
    lastAssistantSummary: null,
    lastError: null,
    latestRunId: null,
    latestUserPrompt: null,
    lastTriggeredTurnCount: null,
    sessionId: null,
    sessionTitle: null,
    recentRuns: [],
  };
}

function buildTurnInput(content: string) {
  const text = content.trim();

  return text ? [{ type: "text", text }] satisfies AppServerUserInput[] : [];
}

async function consumeTurnNotifications(notifications: AsyncIterable<AppServerNotification>) {
  let error: string | null = null;

  for await (const notification of notifications) {
    if (
      notification.method === "turn/completed" &&
      notification.params &&
      notification.params.turn &&
      typeof notification.params.turn === "object" &&
      "status" in notification.params.turn &&
      notification.params.turn.status !== "completed"
    ) {
      error =
        "error" in notification.params.turn &&
        notification.params.turn.error &&
        typeof notification.params.turn.error === "object" &&
        "message" in notification.params.turn.error &&
        typeof notification.params.turn.error.message === "string"
          ? notification.params.turn.error.message
          : "Codex turn failed";
    }
  }

  return error;
}

function createGoalStep(input: {
  turnNumber: number;
  prompt: string;
  assistantReply: string | null;
  evaluationDone: boolean;
  evaluationReason: string;
  nextUserPrompt: string | null;
  createdAt: string;
}) {
  return {
    turnNumber: input.turnNumber,
    prompt: input.prompt,
    assistantReply: input.assistantReply,
    evaluationDone: input.evaluationDone,
    evaluationReason: input.evaluationReason,
    nextUserPrompt: input.nextUserPrompt,
    createdAt: input.createdAt,
    completedAt: new Date().toISOString(),
  };
}

function createRunSummary(
  status: GoalAutomationRunStatus,
  stopReason: GoalAutomationStopReason,
  evaluationReason: string | null,
  lastError: string | null,
) {
  if (status === "failed") {
    return lastError || "Run failed.";
  }

  if (stopReason === "completed") {
    return evaluationReason || "Goal completed.";
  }

  if (stopReason === "max_turns_reached") {
    return evaluationReason || "Stopped after reaching max turns.";
  }

  if (stopReason === "max_duration_reached") {
    return evaluationReason || "Stopped after reaching max duration.";
  }

  if (stopReason === "stopped_by_user") {
    return "Stopped by user.";
  }

  return evaluationReason || "Run finished.";
}

function formatRunOutput(steps: GoalAutomationRunStep[]) {
  if (steps.length === 0) {
    return null;
  }

  return steps
    .map((step) => {
      return [
        `Turn ${step.turnNumber}`,
        `User prompt:\n${step.prompt.trim() || "-"}`,
        `Assistant reply:\n${step.assistantReply?.trim() || "-"}`,
        `Evaluation done: ${step.evaluationDone ? "yes" : "no"}`,
        `Evaluation reason:\n${step.evaluationReason.trim() || "-"}`,
        `Next user prompt:\n${step.nextUserPrompt?.trim() || "-"}`,
      ].join("\n\n");
    })
    .join("\n\n---\n\n");
}

function buildInitialGoalPrompt(goal: string, acceptanceCriteria: string | null) {
  const sections = [
    "你现在开始围绕一个明确目标持续推进。",
    "",
    "目标：",
    goal.trim(),
    "",
  ];

  if (acceptanceCriteria?.trim()) {
    sections.push("验收标准：", acceptanceCriteria.trim(), "");
  }

  sections.push(
    "要求：",
    "1. 直接开始执行，不要先反问。",
    "2. 如果有不确定处，优先做合理假设并说明。",
    "3. 给出本轮能完成的最大推进。",
    "4. 在结尾明确说明距离目标还差什么。",
    "5. 只有在验收标准满足时，才把任务视为完成。",
  );

  return sections.join("\n");
}

function buildFallbackContinuationPrompt(goal: string, acceptanceCriteria: string | null, completedTurns: number) {
  const sections = [
    `继续推进这个目标：${goal.trim()}`,
    "",
    `你已经完成了 ${completedTurns} 轮自动推进。`,
    "请基于上文直接执行下一步，不要等待人类补充。",
    "如果目标仍未完成，请优先解决当前最关键的阻塞项。",
  ];

  if (acceptanceCriteria?.trim()) {
    sections.push("", "仍需满足的验收标准：", acceptanceCriteria.trim());
  }

  return sections.join("\n");
}

function createGoalEvaluationPrompt(input: {
  goal: string;
  acceptanceCriteria: string | null;
  maxTurns: number;
  turnNumber: number;
  assistantReply: string | null;
  steps: GoalAutomationRunStep[];
}) {
  const recentSteps = input.steps.slice(-3).map((step) => ({
    turnNumber: step.turnNumber,
    prompt: step.prompt,
    assistantReply: step.assistantReply,
    evaluationReason: step.evaluationReason,
  }));

  return [
    "你是 Relay 的目标评估器。请判断目标是否已经完成。",
    "",
    `目标：${input.goal.trim()}`,
    `验收标准：${input.acceptanceCriteria?.trim() || "未提供。默认采取保守判断，除非已经有明确交付物且没有剩余工作。"}`,
    `当前轮次：${input.turnNumber}/${input.maxTurns}`,
    "",
    "最近 assistant 最终回答：",
    input.assistantReply?.trim() || "-",
    "",
    "最近几轮上下文(JSON)：",
    JSON.stringify(recentSteps, null, 2),
    "",
    "请只返回严格 JSON，不要输出 Markdown，不要输出解释。",
    'JSON 结构必须是：{"done":boolean,"reason":string,"nextUserPrompt":string|null}',
    "规则：",
    "1. 只有在目标已经被实质完成，且所有验收标准都已满足时，done 才能为 true。",
    "2. 如果没有提供验收标准，默认采取保守判断；只有在已经形成明确交付物、没有待办项、没有缺口、没有建议的下一步时，done 才能为 true。",
    "3. 只要 assistant 回答里出现“还差什么 / 下一步 / 还需要 / 尚未验证 / 仍需确认 / 如果继续”的信号，done 必须为 false。",
    "4. 如果目标未完成，nextUserPrompt 必须是一条可以直接继续推进任务的 user message，优先瞄准尚未满足的验收标准。",
    "5. 如果仍可继续推进，不要要求人类补充输入。",
  ].join("\n");
}

function parseGoalEvaluation(raw: string): GoalEvaluationResult | null {
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    candidates.unshift(fenced[1]);
  }

  const objectLike = raw.match(/\{[\s\S]*\}/);
  if (objectLike?.[0]) {
    candidates.unshift(objectLike[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        done?: unknown;
        reason?: unknown;
        nextUserPrompt?: unknown;
      };

      if (typeof parsed.done !== "boolean" || typeof parsed.reason !== "string") {
        continue;
      }

      return {
        done: parsed.done,
        reason: parsed.reason.trim() || (parsed.done ? "Goal completed." : "Goal not completed."),
        nextUserPrompt:
          typeof parsed.nextUserPrompt === "string"
            ? parsed.nextUserPrompt.trim() || null
            : null,
      };
    } catch {}
  }

  return null;
}

function extractLatestAssistantReply(thread: AppServerThread) {
  const lastTurn = [...thread.turns].reverse().find((turn) =>
    turn.items.some((item) => item.type === "agentMessage"),
  );

  if (!lastTurn) {
    return null;
  }

  const lastAssistantItem = [...lastTurn.items]
    .reverse()
    .find((item): item is Extract<AppServerTurn["items"][number], { type: "agentMessage" }> => item.type === "agentMessage");

  return lastAssistantItem?.text?.trim() || null;
}

function summarizeAssistantReply(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

function persistMaterializedSessionSnapshots(
  workspaceStore: WorkspaceStore,
  workspaceId: string,
  thread: AppServerThread,
) {
  const detail = mapThreadToSessionDetail(thread, workspaceId);
  const summary = mapThreadToSessionSummary(thread, workspaceId);
  const snapshot = workspaceStore.getSessionListSnapshot(workspaceId);
  const nextItems = [summary, ...(snapshot?.items ?? []).filter((item) => item.id !== summary.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  workspaceStore.saveSessionDetailSnapshot(detail);
  workspaceStore.saveSessionListSnapshot(workspaceId, nextItems);
}

function publishThreadSyncEvents(
  runtimeEventBus: RuntimeEventBus | undefined,
  sessionId: string,
  workspaceId: string,
) {
  if (!runtimeEventBus) {
    return;
  }

  const createdAt = new Date().toISOString();
  runtimeEventBus.publish({
    type: "thread.updated",
    sessionId,
    workspaceId,
    createdAt,
  });
  runtimeEventBus.publish({
    type: "thread.list.changed",
    sessionId,
    workspaceId,
    createdAt,
  });
}

function mapThreadToSessionDetail(thread: AppServerThread, workspaceId: string) {
  const messages = [];
  const baseMs = thread.createdAt * 1000;

  thread.turns.forEach((turn, turnIndex) => {
    turn.items.forEach((item, itemIndex) => {
      if (item.type !== "userMessage" && item.type !== "agentMessage") {
        return;
      }

      const sequence = messages.length + 1;
      const timestamp = new Date(baseMs + (turnIndex * 10 + itemIndex) * 1000).toISOString();

      messages.push({
        id: item.id,
        sessionId: thread.id,
        role: item.type === "userMessage" ? "user" : "assistant",
        content: item.type === "userMessage" ? formatUserMessageContent(item.content) : item.text,
        status: turn.status === "failed" ? "error" : "completed",
        sequence,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  });

  return {
    id: thread.id,
    workspaceId,
    title: thread.name?.trim() ? thread.name : deriveTitle(thread.preview),
    turnCount: messages.filter((message) => message.role === "user").length,
    messages,
    cwd: thread.cwd,
    createdAt: new Date(thread.createdAt * 1000).toISOString(),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
  };
}

function mapThreadToSessionSummary(thread: AppServerThread, workspaceId: string) {
  return {
    id: thread.id,
    workspaceId,
    title: thread.name?.trim() ? thread.name : deriveTitle(thread.preview),
    turnCount: thread.turns.filter((turn) => turn.items.some((item) => item.type === "userMessage")).length,
    messages: [],
    cwd: thread.cwd,
    createdAt: new Date(thread.createdAt * 1000).toISOString(),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
  };
}

function formatUserMessageContent(content: AppServerUserInput[]) {
  return content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }

      if (part.type === "localImage") {
        return `[Image: ${path.basename(part.path)}]`;
      }

      return "[Image URL]";
    })
    .filter(Boolean)
    .join("\n");
}

function deriveTitle(preview: string) {
  const normalized = preview.trim();

  if (!normalized) {
    return "New Session";
  }

  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized;
}

function deriveGoalSessionTitle(title: string, goal: string) {
  const preferred = title.trim() || goal.trim();

  if (!preferred) {
    return "Goal Session";
  }

  return preferred.length > 48 ? `${preferred.slice(0, 48)}…` : preferred;
}

export { GoalAutomationExecutor, createIdleGoalRunState };
