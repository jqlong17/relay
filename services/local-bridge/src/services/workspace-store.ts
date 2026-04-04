import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { Session, Workspace } from "@relay/shared-types";
import { RelayStateStore } from "./relay-state-store";

class WorkspaceStore {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly relayStateStore: RelayStateStore;

  constructor(relayStateStore = new RelayStateStore()) {
    this.relayStateStore = relayStateStore;

    for (const workspace of relayStateStore.getWorkspaces()) {
      if (fs.existsSync(workspace.localPath) && fs.statSync(workspace.localPath).isDirectory()) {
        this.workspaces.set(workspace.id, workspace);
      }
    }

    this.persist();
  }

  list() {
    return [...this.workspaces.values()].sort((a, b) => {
      if (a.isActive === b.isActive) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }

      return a.isActive ? -1 : 1;
    });
  }

  getActive() {
    return this.list().find((workspace) => workspace.isActive);
  }

  get(workspaceId: string) {
    return this.workspaces.get(workspaceId);
  }

  findByLocalPath(localPath: string) {
    return [...this.workspaces.values()].find((workspace) => workspace.localPath === localPath);
  }

  open(localPath: string) {
    const absolutePath = path.resolve(localPath);

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
      throw new Error(`Workspace path is not a directory: ${absolutePath}`);
    }

    const now = new Date().toISOString();

    for (const workspace of this.workspaces.values()) {
      workspace.isActive = false;
    }

    const existing = [...this.workspaces.values()].find(
      (workspace) => workspace.localPath === absolutePath,
    );

    if (existing) {
      existing.isActive = true;
      existing.updatedAt = now;
      this.persist();
      return existing;
    }

    const workspace: Workspace = {
      id: randomUUID(),
      name: path.basename(absolutePath),
      localPath: absolutePath,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(workspace.id, workspace);
    this.persist();
    return workspace;
  }

  remove(workspaceId: string) {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      return null;
    }

    const wasActive = workspace.isActive;
    this.workspaces.delete(workspaceId);

    if (wasActive) {
      const nextActive = this.list()[0];

      if (nextActive) {
        nextActive.isActive = true;
        nextActive.updatedAt = new Date().toISOString();
      }
    }

    this.relayStateStore.clearPreferredSessionId(workspaceId);
    this.relayStateStore.clearSessionSnapshotsForWorkspace(workspaceId);
    this.persist();
    return workspace;
  }

  getPreferredSessionId(workspaceId: string) {
    return this.relayStateStore.getPreferredSessionId(workspaceId);
  }

  getSessionListSnapshot(workspaceId: string) {
    return this.relayStateStore.getSessionListSnapshot(workspaceId);
  }

  saveSessionListSnapshot(workspaceId: string, items: Session[]) {
    this.relayStateStore.saveSessionListSnapshot(workspaceId, items);
  }

  clearSessionListSnapshot(workspaceId: string) {
    this.relayStateStore.clearSessionListSnapshot(workspaceId);
  }

  getSessionDetailSnapshot(sessionId: string) {
    return this.relayStateStore.getSessionDetailSnapshot(sessionId);
  }

  saveSessionDetailSnapshot(session: Session) {
    this.relayStateStore.saveSessionDetailSnapshot(session);
  }

  clearSessionDetailSnapshot(sessionId: string) {
    this.relayStateStore.clearSessionDetailSnapshot(sessionId);
  }

  clearSessionSnapshotsForWorkspace(workspaceId: string) {
    this.relayStateStore.clearSessionSnapshotsForWorkspace(workspaceId);
  }

  setPreferredSessionId(workspaceId: string, sessionId: string) {
    this.relayStateStore.setPreferredSessionId(workspaceId, sessionId);
  }

  clearPreferredSessionId(workspaceId: string, sessionId?: string) {
    this.relayStateStore.clearPreferredSessionId(workspaceId, sessionId);
  }

  getRelayStateStore() {
    return this.relayStateStore;
  }

  private persist() {
    const items = [...this.workspaces.values()];
    const validWorkspaceIds = new Set(items.map((workspace) => workspace.id));
    this.relayStateStore.saveWorkspaces(items);
    this.relayStateStore.pruneWorkspacePreferences(validWorkspaceIds);
    this.relayStateStore.pruneSessionSnapshots(validWorkspaceIds);
    this.relayStateStore.pruneInternalAutomationState(validWorkspaceIds);
  }
}

export { WorkspaceStore };
