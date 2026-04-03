import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Workspace } from "@relay/shared-types";

type RelayBridgeState = {
  preferredSessionIdsByWorkspaceId: Record<string, string>;
  workspaces: Workspace[];
};

const DEFAULT_STATE: RelayBridgeState = {
  preferredSessionIdsByWorkspaceId: {},
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

  private readState() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return structuredClone(DEFAULT_STATE);
      }

      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RelayBridgeState>;

      return {
        preferredSessionIdsByWorkspaceId: parsed.preferredSessionIdsByWorkspaceId ?? {},
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
