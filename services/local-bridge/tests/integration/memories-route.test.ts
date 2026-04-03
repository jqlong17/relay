import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer } from "../../src";
import { MemoryStore, createThemeKey } from "../../src/services/memory-store";
import { TimelineMemoryService } from "../../src/services/timeline-memory-service";
import { RelayStateStore } from "../../src/services/relay-state-store";
import { WorkspaceStore } from "../../src/services/workspace-store";

let activeServer: ReturnType<typeof createBridgeServer> | undefined;
let activeMemoryStore: MemoryStore | undefined;
const tempDirs: string[] = [];

afterEach(async () => {
  activeMemoryStore?.close();
  activeMemoryStore = undefined;

  while (tempDirs.length > 0) {
    const current = tempDirs.pop();
    if (current) {
      fs.rmSync(current, { recursive: true, force: true });
    }
  }

  if (activeServer) {
    await new Promise<void>((resolve, reject) => {
      activeServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    activeServer = undefined;
  }
});

describe("memories routes", () => {
  it("returns memories by session, date, and theme", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-memories-route-"));
    tempDirs.push(dir);
    activeMemoryStore = new MemoryStore(path.join(dir, "relay-memory.db"));

    activeMemoryStore.create({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      themeTitle: "【记忆优化】",
      themeKey: createThemeKey("【记忆优化】"),
      sessionTitleSnapshot: "【记忆优化】",
      memoryDate: "2026-04-03",
      checkpointTurnCount: 20,
      promptVersion: "timeline-memory/v1",
      title: "session memory",
      content: "内容 A",
      status: "completed",
    });

    activeServer = createBridgeServer({
      memoryStore: activeMemoryStore,
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    const [sessionResponse, dateResponse, themeResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${address.port}/sessions/session-1/memories`),
      fetch(`http://127.0.0.1:${address.port}/memories?date=2026-04-03`),
      fetch(`http://127.0.0.1:${address.port}/memories?themeKey=${encodeURIComponent("记忆优化")}`),
      fetch(`http://127.0.0.1:${address.port}/memories`),
    ]);

    const sessionData = (await sessionResponse.json()) as { items: Array<{ sessionId: string }> };
    const dateData = (await dateResponse.json()) as { items: Array<{ memoryDate: string }> };
    const themeData = (await themeResponse.json()) as { items: Array<{ themeKey: string }> };
    const allData = (await (await fetch(`http://127.0.0.1:${address.port}/memories`)).json()) as { items: Array<{ id: string }> };

    expect(sessionResponse.status).toBe(200);
    expect(sessionData.items[0]?.sessionId).toBe("session-1");
    expect(dateData.items[0]?.memoryDate).toBe("2026-04-03");
    expect(themeData.items[0]?.themeKey).toBe("记忆优化");
    expect(allData.items).toHaveLength(1);
  });

  it("supports manual generate and regenerate through the route", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-memories-generate-"));
    tempDirs.push(dir);
    activeMemoryStore = new MemoryStore(path.join(dir, "relay-memory.db"));
    const workspaceStore = new WorkspaceStore(new RelayStateStore(path.join(dir, "relay-state.json")));
    const workspace = workspaceStore.open(dir);
    workspaceStore.saveSessionDetailSnapshot({
      id: "session-1",
      workspaceId: workspace.id,
      title: "【记忆优化】",
      turnCount: 5,
      messages: [],
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
    });
    let version = 0;

    activeServer = createBridgeServer({
      memoryStore: activeMemoryStore,
      workspaceStore,
      timelineMemoryService: new TimelineMemoryService({
        memoryStore: activeMemoryStore,
        workspaceStore,
        codexAppServerService: undefined as never,
        generateTimelineMemoryText: async () => {
          version += 1;
          return `版本 ${version}`;
        },
      }),
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    const firstResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/session-1/memories/generate`, {
      method: "POST",
    });
    const secondResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/session-1/memories/generate?force=1`, {
      method: "POST",
    });

    const firstData = (await firstResponse.json()) as { item: { checkpointTurnCount: number; content: string } };
    const secondData = (await secondResponse.json()) as { item: { checkpointTurnCount: number; content: string } };

    expect(firstData.item.checkpointTurnCount).toBe(5);
    expect(secondData.item.content).toBe("版本 2");
    expect(activeMemoryStore.listBySessionId("session-1")).toHaveLength(1);
  });
});
