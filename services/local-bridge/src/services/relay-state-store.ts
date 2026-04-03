import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Session, Workspace } from "@relay/shared-types";

type SessionListSnapshot = {
  items: Session[];
  updatedAt: string;
};

type RelayBridgeState = {
  preferredSessionIdsByWorkspaceId: Record<string, string>;
  sessionDetailsBySessionId: Record<string, Session>;
  sessionListsByWorkspaceId: Record<string, SessionListSnapshot>;
  workspaces: Workspace[];
};

const DEFAULT_STATE: RelayBridgeState = {
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

  private readState() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return structuredClone(DEFAULT_STATE);
      }

      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RelayBridgeState>;

      return {
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
