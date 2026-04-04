import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MemoryStore, createThemeKey } from "../../src";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("MemoryStore", () => {
  it("initializes the sqlite database and table on first use", () => {
    const dbPath = createTempDbPath();

    const store = new MemoryStore(dbPath);
    const items = store.listBySessionId("session-1");

    expect(fs.existsSync(dbPath)).toBe(true);
    expect(items).toEqual([]);
    store.close();
  });

  it("inserts and queries memories by session and date", () => {
    const dbPath = createTempDbPath();
    const store = new MemoryStore(dbPath);

    const created = store.create({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      themeTitle: "【记忆优化】",
      themeKey: createThemeKey("【记忆优化】"),
      sessionTitleSnapshot: "【记忆优化】",
      memoryDate: "2026-04-03",
      checkpointTurnCount: 20,
      promptVersion: "timeline-memory/v1",
      title: "20轮时间线记忆",
      content: "总结内容 A",
      status: "completed",
      sourceThreadUpdatedAt: "2026-04-03T08:00:00.000Z",
    });

    expect(created.sessionId).toBe("session-1");
    expect(store.listBySessionId("session-1")).toHaveLength(1);
    expect(store.listByDate("2026-04-03")).toHaveLength(1);
    expect(store.listByThemeKey(createThemeKey("记忆优化"))).toHaveLength(1);
    store.close();
  });

  it("ignores duplicate checkpoint inserts for the same session", () => {
    const dbPath = createTempDbPath();
    const store = new MemoryStore(dbPath);

    store.create({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      themeTitle: "【记忆优化】",
      themeKey: createThemeKey("【记忆优化】"),
      sessionTitleSnapshot: "【记忆优化】",
      memoryDate: "2026-04-03",
      checkpointTurnCount: 20,
      promptVersion: "timeline-memory/v1",
      title: "20轮时间线记忆",
      content: "总结内容 A",
      status: "completed",
    });

    const duplicate = store.create({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      themeTitle: "【记忆优化】",
      themeKey: createThemeKey("【记忆优化】"),
      sessionTitleSnapshot: "【记忆优化】",
      memoryDate: "2026-04-03",
      checkpointTurnCount: 20,
      promptVersion: "timeline-memory/v1",
      title: "重复总结",
      content: "总结内容 B",
      status: "completed",
    });

    expect(duplicate.content).toBe("总结内容 A");
    expect(store.listBySessionId("session-1")).toHaveLength(1);
    store.close();
  });
});

describe("createThemeKey", () => {
  it("normalizes bracketed and spaced session titles", () => {
    expect(createThemeKey("【  Web端开发  】")).toBe("web端开发");
    expect(createThemeKey("  [记忆 优化]  ")).toBe("记忆 优化");
  });
});

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-memory-store-"));
  tempDirs.push(dir);
  return path.join(dir, "relay-memory.db");
}
