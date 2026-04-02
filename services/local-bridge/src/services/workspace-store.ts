import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { Workspace } from "@relay/shared-types";

class WorkspaceStore {
  private readonly workspaces = new Map<string, Workspace>();

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

    return workspace;
  }
}

export { WorkspaceStore };
