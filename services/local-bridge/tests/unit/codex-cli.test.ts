import { describe, expect, it } from "vitest";

import { CodexCliService } from "../../src/services/codex-cli";

describe("CodexCliService", () => {
  it("returns a minimum runtime event sequence", async () => {
    const service = new CodexCliService();

    const events = await service.run({
      sessionId: "session-1",
      prompt: "Implement a function",
      workingDirectory: process.cwd(),
    });

    expect(events[0]?.type).toBe("run.started");
    expect(events.some((event) => event.type === "message.delta")).toBe(true);
    expect(events[events.length - 1]?.type).toBe("run.completed");
  });
});
