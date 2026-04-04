type AutomationStatus = "active" | "paused";

type AutomationSource = "relay";

type AutomationKind = "timeline-memory-checkpoint" | "goal-loop";

type AutomationCapabilities = {
  canEdit: boolean;
  canDelete: boolean;
  canRun: boolean;
  canStop: boolean;
};

type GoalAutomationTargetSessionMode = "existing-session" | "new-session";

type GoalAutomationRunStatus = "idle" | "running" | "completed" | "stopped" | "failed";

type GoalAutomationStopReason =
  | "completed"
  | "max_turns_reached"
  | "max_duration_reached"
  | "stopped_by_user"
  | "failed";

type AutomationRuleBase = {
  id: string;
  kind: AutomationKind;
  source: AutomationSource;
  title: string;
  summary: string;
  status: AutomationStatus;
  workspaceId: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  capabilities: AutomationCapabilities;
};

type TimelineMemoryCheckpointAutomationRule = AutomationRuleBase & {
  kind: "timeline-memory-checkpoint";
  intervalTurns: number;
  currentTurnCount: number | null;
  turnsUntilNextRun: number | null;
  nextCheckpointTurnCount: number | null;
};

type GoalAutomationRule = AutomationRuleBase & {
  kind: "goal-loop";
  goal: string;
  trigger: "manual";
  targetSessionMode: GoalAutomationTargetSessionMode;
  maxTurns: number;
  maxDurationMinutes: number;
  runStatus: GoalAutomationRunStatus;
  currentTurnCount: number;
  stopReason: GoalAutomationStopReason | null;
  lastEvaluationReason: string | null;
  lastAssistantSummary: string | null;
  lastError: string | null;
  latestRunId: string | null;
};

type GoalAutomationRuleInput = {
  title: string;
  goal: string;
  status?: AutomationStatus;
  workspaceId?: string | null;
  targetSessionMode: GoalAutomationTargetSessionMode;
  targetSessionId?: string | null;
  targetSessionTitle?: string | null;
  maxTurns?: number;
  maxDurationMinutes?: number;
};

type GoalAutomationRuleDefinition = {
  id: string;
  kind: "goal-loop";
  title: string;
  goal: string;
  status: AutomationStatus;
  workspaceId: string;
  targetSessionMode: GoalAutomationTargetSessionMode;
  targetSessionId: string | null;
  targetSessionTitle: string | null;
  maxTurns: number;
  maxDurationMinutes: number;
  createdAt: string;
  updatedAt: string;
};

type GoalAutomationRunStep = {
  turnNumber: number;
  prompt: string;
  assistantReply: string | null;
  evaluationDone: boolean;
  evaluationReason: string;
  nextUserPrompt: string | null;
  createdAt: string;
  completedAt: string | null;
};

type GoalAutomationRunRecord = {
  id: string;
  ruleId: string;
  status: GoalAutomationRunStatus;
  stopReason: GoalAutomationStopReason | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  summary: string | null;
  output: string | null;
  turnsCompleted: number;
  sessionId: string | null;
  sessionTitle: string | null;
  lastEvaluationReason: string | null;
  lastAssistantSummary: string | null;
  lastError: string | null;
  steps: GoalAutomationRunStep[];
};

type GoalAutomationRunState = {
  ruleId: string;
  runStatus: GoalAutomationRunStatus;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  currentTurnCount: number;
  stopReason: GoalAutomationStopReason | null;
  lastEvaluationReason: string | null;
  lastAssistantSummary: string | null;
  lastError: string | null;
  latestRunId: string | null;
  latestUserPrompt: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  recentRuns: GoalAutomationRunRecord[];
};

type AutomationRule = TimelineMemoryCheckpointAutomationRule | GoalAutomationRule;

export type {
  AutomationCapabilities,
  AutomationKind,
  AutomationRule,
  AutomationSource,
  AutomationStatus,
  GoalAutomationRule,
  GoalAutomationRuleDefinition,
  GoalAutomationRuleInput,
  GoalAutomationRunRecord,
  GoalAutomationRunState,
  GoalAutomationRunStatus,
  GoalAutomationRunStep,
  GoalAutomationStopReason,
  GoalAutomationTargetSessionMode,
  TimelineMemoryCheckpointAutomationRule,
};
