import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  RelayDevice,
  GoalAutomationRuleDefinition,
  GoalAutomationRunState,
  Session,
  Workspace,
} from "@relay/shared-types";

type SessionListSnapshot = {
  items: Session[];
  updatedAt: string;
};

type StoredRelayDevice = Omit<RelayDevice, "lastSeenAt" | "status">;

type RelayBridgeState = {
  internalAutomationRulesByWorkspaceId: Record<string, GoalAutomationRuleDefinition[]>;
  internalAutomationRunStatesByRuleId: Record<string, GoalAutomationRunState>;
  localDevice: StoredRelayDevice | null;
  preferredSessionIdsByWorkspaceId: Record<string, string>;
  sessionDetailsBySessionId: Record<string, Session>;
  sessionListsByWorkspaceId: Record<string, SessionListSnapshot>;
  workspaces: Workspace[];
};

const DEFAULT_STATE: RelayBridgeState = {
  internalAutomationRulesByWorkspaceId: {},
  internalAutomationRunStatesByRuleId: {},
  localDevice: null,
  preferredSessionIdsByWorkspaceId: {},
  sessionDetailsBySessionId: {},
  sessionListsByWorkspaceId: {},
  workspaces: [],
};

class RelayStateStore {
  private readonly filePath: string;
  private state: RelayBridgeState;

  constructor(filePath = resolveDefaultStateFilePath()) {
    this.filePath = filePath;
    this.state = this.readState();
  }

  getWorkspaces() {
    return this.state.workspaces;
  }

  getLocalDevice() {
    return this.state.localDevice;
  }

  saveLocalDevice(device: StoredRelayDevice) {
    this.state.localDevice = device;
    this.writeState();
  }

  listInternalAutomationRules(workspaceId: string) {
    return this.state.internalAutomationRulesByWorkspaceId[workspaceId] ?? [];
  }

  saveInternalAutomationRule(rule: GoalAutomationRuleDefinition) {
    const currentRules = this.state.internalAutomationRulesByWorkspaceId[rule.workspaceId] ?? [];
    const nextRules = currentRules.filter((item) => item.id !== rule.id);

    nextRules.push(rule);
    nextRules.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    this.state.internalAutomationRulesByWorkspaceId[rule.workspaceId] = nextRules;
    this.writeState();
  }

  getInternalAutomationRule(ruleId: string) {
    for (const rules of Object.values(this.state.internalAutomationRulesByWorkspaceId)) {
      const match = rules.find((item) => item.id === ruleId);
      if (match) {
        return match;
      }
    }

    return null;
  }

  deleteInternalAutomationRule(ruleId: string) {
    let hasChanges = false;

    for (const [workspaceId, rules] of Object.entries(this.state.internalAutomationRulesByWorkspaceId)) {
      const nextRules = rules.filter((item) => item.id !== ruleId);
      if (nextRules.length === rules.length) {
        continue;
      }

      if (nextRules.length === 0) {
        delete this.state.internalAutomationRulesByWorkspaceId[workspaceId];
      } else {
        this.state.internalAutomationRulesByWorkspaceId[workspaceId] = nextRules;
      }
      hasChanges = true;
    }

    if (this.state.internalAutomationRunStatesByRuleId[ruleId]) {
      delete this.state.internalAutomationRunStatesByRuleId[ruleId];
      hasChanges = true;
    }

    if (hasChanges) {
      this.writeState();
    }
  }

  getInternalAutomationRunState(ruleId: string) {
    return this.state.internalAutomationRunStatesByRuleId[ruleId] ?? null;
  }

  saveInternalAutomationRunState(runState: GoalAutomationRunState) {
    this.state.internalAutomationRunStatesByRuleId[runState.ruleId] = runState;
    this.writeState();
  }

  clearInternalAutomationRunState(ruleId: string) {
    if (!this.state.internalAutomationRunStatesByRuleId[ruleId]) {
      return;
    }

    delete this.state.internalAutomationRunStatesByRuleId[ruleId];
    this.writeState();
  }

  saveWorkspaces(workspaces: Workspace[]) {
    this.state.workspaces = workspaces;
    this.writeState();
  }

  getPreferredSessionId(workspaceId: string) {
    return this.state.preferredSessionIdsByWorkspaceId[workspaceId] ?? null;
  }

  getSessionListSnapshot(workspaceId: string) {
    return this.state.sessionListsByWorkspaceId[workspaceId] ?? null;
  }

  saveSessionListSnapshot(workspaceId: string, items: Session[]) {
    this.state.sessionListsByWorkspaceId[workspaceId] = {
      items,
      updatedAt: new Date().toISOString(),
    };
    this.writeState();
  }

  clearSessionListSnapshot(workspaceId: string) {
    if (!this.state.sessionListsByWorkspaceId[workspaceId]) {
      return;
    }

    delete this.state.sessionListsByWorkspaceId[workspaceId];
    this.writeState();
  }

  getSessionDetailSnapshot(sessionId: string) {
    return this.state.sessionDetailsBySessionId[sessionId] ?? null;
  }

  saveSessionDetailSnapshot(session: Session) {
    this.state.sessionDetailsBySessionId[session.id] = session;
    this.writeState();
  }

  clearSessionDetailSnapshot(sessionId: string) {
    if (!this.state.sessionDetailsBySessionId[sessionId]) {
      return;
    }

    delete this.state.sessionDetailsBySessionId[sessionId];
    this.writeState();
  }

  clearSessionSnapshotsForWorkspace(workspaceId: string) {
    let hasChanges = false;

    if (this.state.sessionListsByWorkspaceId[workspaceId]) {
      delete this.state.sessionListsByWorkspaceId[workspaceId];
      hasChanges = true;
    }

    for (const [sessionId, session] of Object.entries(this.state.sessionDetailsBySessionId)) {
      if (session.workspaceId === workspaceId) {
        delete this.state.sessionDetailsBySessionId[sessionId];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.writeState();
    }
  }

  setPreferredSessionId(workspaceId: string, sessionId: string) {
    this.state.preferredSessionIdsByWorkspaceId[workspaceId] = sessionId;
    this.writeState();
  }

  clearPreferredSessionId(workspaceId: string, sessionId?: string) {
    const current = this.state.preferredSessionIdsByWorkspaceId[workspaceId];

    if (!current) {
      return;
    }

    if (sessionId && current !== sessionId) {
      return;
    }

    delete this.state.preferredSessionIdsByWorkspaceId[workspaceId];
    this.writeState();
  }

  pruneWorkspacePreferences(validWorkspaceIds: Set<string>) {
    let hasChanges = false;

    for (const workspaceId of Object.keys(this.state.preferredSessionIdsByWorkspaceId)) {
      if (!validWorkspaceIds.has(workspaceId)) {
        delete this.state.preferredSessionIdsByWorkspaceId[workspaceId];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.writeState();
    }
  }

  pruneSessionSnapshots(validWorkspaceIds: Set<string>) {
    let hasChanges = false;

    for (const workspaceId of Object.keys(this.state.sessionListsByWorkspaceId)) {
      if (!validWorkspaceIds.has(workspaceId)) {
        delete this.state.sessionListsByWorkspaceId[workspaceId];
        hasChanges = true;
      }
    }

    for (const [sessionId, session] of Object.entries(this.state.sessionDetailsBySessionId)) {
      if (!validWorkspaceIds.has(session.workspaceId)) {
        delete this.state.sessionDetailsBySessionId[sessionId];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.writeState();
    }
  }

  pruneInternalAutomationState(validWorkspaceIds: Set<string>) {
    let hasChanges = false;
    const validRuleIds = new Set<string>();

    for (const workspaceId of Object.keys(this.state.internalAutomationRulesByWorkspaceId)) {
      if (!validWorkspaceIds.has(workspaceId)) {
        delete this.state.internalAutomationRulesByWorkspaceId[workspaceId];
        hasChanges = true;
        continue;
      }

      for (const rule of this.state.internalAutomationRulesByWorkspaceId[workspaceId] ?? []) {
        validRuleIds.add(rule.id);
      }
    }

    for (const ruleId of Object.keys(this.state.internalAutomationRunStatesByRuleId)) {
      if (!validRuleIds.has(ruleId)) {
        delete this.state.internalAutomationRunStatesByRuleId[ruleId];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.writeState();
    }
  }

  private readState() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return structuredClone(DEFAULT_STATE);
      }

      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RelayBridgeState>;
      const normalizedRules = Object.fromEntries(
        Object.entries(parsed.internalAutomationRulesByWorkspaceId ?? {}).map(([workspaceId, rules]) => [
          workspaceId,
          Array.isArray(rules) ? rules.map(normalizeInternalAutomationRuleDefinition) : [],
        ]),
      );
      const normalizedRunStates = Object.fromEntries(
        Object.entries(parsed.internalAutomationRunStatesByRuleId ?? {}).map(([ruleId, runState]) => [
          ruleId,
          normalizeInternalAutomationRunState(ruleId, runState),
        ]),
      );

      return {
        internalAutomationRulesByWorkspaceId: normalizedRules,
        internalAutomationRunStatesByRuleId: normalizedRunStates,
        localDevice: normalizeStoredRelayDevice(parsed.localDevice),
        preferredSessionIdsByWorkspaceId: parsed.preferredSessionIdsByWorkspaceId ?? {},
        sessionDetailsBySessionId: parsed.sessionDetailsBySessionId ?? {},
        sessionListsByWorkspaceId: parsed.sessionListsByWorkspaceId ?? {},
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  private writeState() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }
}

function resolveDefaultStateFilePath() {
  const customPath = process.env.RELAY_STATE_FILE_PATH;

  if (customPath) {
    return path.resolve(customPath);
  }

  return path.join(os.homedir(), ".relay", "local-bridge-state.json");
}

function normalizeInternalAutomationRuleDefinition(value: unknown): GoalAutomationRuleDefinition {
  const rule = value as Partial<GoalAutomationRuleDefinition> & {
    actionType?: string;
    goal?: string | null;
    trigger?: { kind?: string; turnInterval?: number | null } | null;
  };
  const triggerKind = rule.trigger?.kind === "turn-interval" ? "turn-interval" : "manual";
  const turnInterval =
    triggerKind === "turn-interval" && typeof rule.trigger?.turnInterval === "number" && Number.isFinite(rule.trigger.turnInterval)
      ? Math.max(1, Math.round(rule.trigger.turnInterval))
      : null;

  return {
    ...(rule as GoalAutomationRuleDefinition),
    kind: "goal-loop",
    actionType: rule.actionType === "generate-timeline-memory" ? "generate-timeline-memory" : "continue-session",
    trigger: {
      kind: triggerKind,
      turnInterval,
    },
    goal: typeof rule.goal === "string" ? rule.goal : null,
    acceptanceCriteria: typeof rule.acceptanceCriteria === "string" ? rule.acceptanceCriteria : null,
    targetSessionMode: rule.targetSessionMode === "existing-session" ? "existing-session" : "new-session",
  };
}

function normalizeInternalAutomationRunState(ruleId: string, value: unknown): GoalAutomationRunState {
  const runState = value as Partial<GoalAutomationRunState>;

  return {
    ruleId,
    runStatus: runState.runStatus ?? "idle",
    startedAt: runState.startedAt ?? null,
    updatedAt: runState.updatedAt ?? null,
    finishedAt: runState.finishedAt ?? null,
    currentTurnCount: typeof runState.currentTurnCount === "number" ? runState.currentTurnCount : 0,
    stopReason: runState.stopReason ?? null,
    lastEvaluationReason: runState.lastEvaluationReason ?? null,
    lastAssistantSummary: runState.lastAssistantSummary ?? null,
    lastError: runState.lastError ?? null,
    latestRunId: runState.latestRunId ?? null,
    latestUserPrompt: runState.latestUserPrompt ?? null,
    lastTriggeredTurnCount:
      typeof runState.lastTriggeredTurnCount === "number" ? runState.lastTriggeredTurnCount : null,
    sessionId: runState.sessionId ?? null,
    sessionTitle: runState.sessionTitle ?? null,
    recentRuns: Array.isArray(runState.recentRuns) ? runState.recentRuns : [],
  };
}

function normalizeStoredRelayDevice(value: unknown): StoredRelayDevice | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const device = value as Partial<StoredRelayDevice>;
  const id = typeof device.id === "string" ? device.id.trim() : "";

  if (id.length === 0) {
    return null;
  }

  return {
    id,
    name: typeof device.name === "string" && device.name.trim().length > 0 ? device.name.trim() : "Relay Device",
    hostname: typeof device.hostname === "string" && device.hostname.trim().length > 0 ? device.hostname.trim() : "unknown",
    platform: typeof device.platform === "string" && device.platform.trim().length > 0 ? device.platform.trim() : "unknown",
    arch: typeof device.arch === "string" && device.arch.trim().length > 0 ? device.arch.trim() : "unknown",
    bindingStatus: device.bindingStatus === "bound" ? "bound" : "unbound",
    boundUserId: typeof device.boundUserId === "string" && device.boundUserId.trim().length > 0 ? device.boundUserId.trim() : null,
    createdAt: typeof device.createdAt === "string" && device.createdAt.trim().length > 0 ? device.createdAt : new Date(0).toISOString(),
    updatedAt: typeof device.updatedAt === "string" && device.updatedAt.trim().length > 0 ? device.updatedAt : new Date(0).toISOString(),
  };
}

export { RelayStateStore };
export type { StoredRelayDevice };
