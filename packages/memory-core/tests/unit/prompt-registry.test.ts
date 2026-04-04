import { describe, expect, it } from "vitest";

import type { Session } from "@relay/shared-types";

import { getMemoryPromptDefinition } from "../../src";

describe("prompt registry", () => {
  it("returns the timeline prompt definition with a stable version", () => {
    const definition = getMemoryPromptDefinition("timeline");
    const prompt = definition.buildPrompt(makeSession(), 20);

    expect(definition.version).toBe("timeline-memory/v1");
    expect(prompt).toContain("时间线记忆");
    expect(prompt).toContain("当前 checkpoint：第 20 条用户消息。");
  });
});

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "【记忆优化】",
    turnCount: 20,
    messages: [
      {
        id: "message-1",
        sessionId: "session-1",
        role: "user",
        content: "请梳理记忆架构",
        status: "completed",
        sequence: 1,
        createdAt: "2026-04-03T00:00:00.000Z",
        updatedAt: "2026-04-03T00:00:00.000Z",
      },
    ],
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
  };
}
