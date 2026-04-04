import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { GoalAutomationRuleDefinition, GoalAutomationRunState, Session, Workspace } from "@relay/shared-types";

type SessionListSnapshot = {
  items: Session[];
  updatedAt: string;
};

type RelayBridgeState = {
  internalAutomationRulesByWorkspaceId: Record<string, GoalAutomationRuleDefinition[]>;
  internalAutomationRunStatesByRuleId: Record<string, GoalAutomationRunState>;
  preferredSessionIdsByWorkspaceId: Record<string, string>;
  sessionDetailsBySessionId: Record<string, Session>;
  sessionListsByWorkspaceId: Record<string, SessionListSnapshot>;
  workspaces: Workspace[];
};

const DEFAULT_STATE: RelayBridgeState = {
  internalAutomationRulesByWorkspaceId: {},
  internalAutomationRunStatesByRuleId: {},
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

      return {
        internalAutomationRulesByWorkspaceId: parsed.internalAutomationRulesByWorkspaceId ?? {},
        internalAutomationRunStatesByRuleId: parsed.internalAutomationRunStatesByRuleId ?? {},
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

export { RelayStateStore };
