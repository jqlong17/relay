import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMemoryInjectionContext, createThemeKey, MemoryStore, searchMemories } from "../../src";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("searchMemories", () => {
  it("filters memories by query and theme", () => {
    const store = new MemoryStore(createTempDbPath());

    store.create(makeMemory({ idSeed: "1", title: "记忆优化 · 20轮", content: "处理时间线记忆主题", themeTitle: "【记忆优化】" }));
    store.create(makeMemory({ idSeed: "2", title: "Web端开发 · 12轮", content: "处理页面滚动问题", themeTitle: "【Web端开发】" }));

    const result = searchMemories(store, { query: "滚动", themeKey: createThemeKey("【Web端开发】") });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toContain("Web端开发");
    store.close();
  });
});

describe("buildMemoryInjectionContext", () => {
  it("builds a reusable context block from memories", () => {
    const store = new MemoryStore(createTempDbPath());
    const first = store.create(makeMemory({ idSeed: "1", title: "记忆优化 · 20轮", content: "总结 A" }));
    const second = store.create(makeMemory({ idSeed: "2", title: "记忆优化 · 40轮", content: "总结 B" }));

    const context = buildMemoryInjectionContext([first, second], { maxItems: 2, maxChars: 4000 });

    expect(context.contextTitle).toBe("Relay Memories");
    expect(context.contextBody).toContain("## 记忆优化 · 20轮");
    expect(context.contextBody).toContain("## 记忆优化 · 40轮");
    expect(context.sourceMemoryIds).toEqual([first.id, second.id]);
    expect(context.truncationApplied).toBe(false);
    store.close();
  });
});

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-memory-retrieval-"));
  tempDirs.push(dir);
  return path.join(dir, "relay-memory.db");
}

function makeMemory(overrides: {
  idSeed?: string;
  title?: string;
  content?: string;
  themeTitle?: string;
} = {}) {
  const themeTitle = overrides.themeTitle ?? "【记忆优化】";
  const idSeed = overrides.idSeed ?? "1";

  return {
    sessionId: `session-${idSeed}`,
    workspaceId: "workspace-1",
    themeTitle,
    themeKey: createThemeKey(themeTitle),
    sessionTitleSnapshot: themeTitle,
    memoryDate: "2026-04-03",
    checkpointTurnCount: Number(idSeed) * 20,
    promptVersion: "timeline-memory/v1",
    title: overrides.title ?? `${themeTitle} · ${idSeed}`,
    content: overrides.content ?? "默认总结",
    status: "completed" as const,
    sourceThreadUpdatedAt: "2026-04-03T00:00:00.000Z",
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: `2026-04-03T00:00:0${idSeed}.000Z`,
  };
}
