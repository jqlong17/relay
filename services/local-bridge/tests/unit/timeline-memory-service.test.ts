import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { Session, Workspace } from "@relay/shared-types";

import { CodexAppServerService } from "../../src/services/codex-app-server";
import { MemoryStore } from "../../src/services/memory-store";
import { RelayStateStore } from "../../src/services/relay-state-store";
import { TimelineMemoryService } from "../../src/services/timeline-memory-service";
import { WorkspaceStore } from "../../src/services/workspace-store";

const tempDirs: string[] = [];
const activeStores: Array<{ close: () => void }> = [];

afterEach(() => {
  while (activeStores.length > 0) {
    activeStores.pop()?.close();
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("TimelineMemoryService", () => {
  it("generates and stores a manual memory using the current turn count", async () => {
    const { memoryStore, service, workspaceStore } = createHarness();
    const workspace = workspaceStore.open(createTempDir("workspace"));
    const session = makeSession({
      id: "session-1",
      workspaceId: workspace.id,
      title: "【记忆优化】",
      turnCount: 7,
    });
    workspaceStore.saveSessionDetailSnapshot(session);

    const memory = await service.generateForSession(session.id, { manual: true });

    expect(memory?.checkpointTurnCount).toBe(7);
    expect(memory?.themeTitle).toBe("【记忆优化】");
    expect(memoryStore.listBySessionId(session.id)).toHaveLength(1);
  });

  it("replaces the existing memory when regenerate is forced", async () => {
    const { memoryStore, service, workspaceStore } = createHarness();
    const workspace = workspaceStore.open(createTempDir("workspace"));
    const session = makeSession({
      id: "session-1",
      workspaceId: workspace.id,
      title: "【记忆优化】",
      turnCount: 20,
    });
    workspaceStore.saveSessionDetailSnapshot(session);

    await service.generateForSession(session.id, { manual: true });
    const regenerated = await service.generateForSession(session.id, { manual: true, force: true });

    expect(memoryStore.listBySessionId(session.id)).toHaveLength(1);
    expect(regenerated?.content).toContain("版本 2");
  });
});

function createHarness() {
  const root = createTempDir("timeline-memory-service");
  const relayStateStore = new RelayStateStore(path.join(root, "relay-state.json"));
  const workspaceStore = new WorkspaceStore(relayStateStore);
  const memoryStore = new MemoryStore(path.join(root, "relay-memory.db"));
  let generateCount = 0;
  const service = new TimelineMemoryService({
    memoryStore,
    workspaceStore,
    codexAppServerService: new CodexAppServerService(),
    generateTimelineMemoryText: async ({ checkpointTurnCount }) => {
      generateCount += 1;
      return `版本 ${generateCount}，checkpoint ${checkpointTurnCount}`;
    },
  });

  activeStores.push(memoryStore);

  return { memoryStore, service, workspaceStore };
}

function createTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "session",
    turnCount: 0,
    messages: [],
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    name: "web-cli",
    localPath: createTempDir("workspace-local"),
    isActive: true,
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}
