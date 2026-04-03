import { describe, expect, it, vi } from "vitest";

import { CodexAppServerService } from "../../src/services/codex-app-server";

describe("CodexAppServerService", () => {
  it("falls back to turn/start when thread resume reports a missing rollout", async () => {
    const service = new CodexAppServerService() as unknown as {
      ensureInitialized: () => Promise<void>;
      threadResume: (threadId: string) => Promise<void>;
      onNotification: (
        listener: (notification: Record<string, unknown>) => void,
      ) => () => void;
      request: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
      startTurnStream: (
        threadId: string,
        input: string,
      ) => Promise<{ turnId: string; notifications: AsyncIterable<unknown> }>;
    };

    service.ensureInitialized = vi.fn(async () => {});
    service.threadResume = vi.fn(async () => {
      throw new Error("no rollout found for thread id thread-new");
    });
    service.onNotification = vi.fn(() => () => {});
    service.request = vi.fn(async (method) => {
      if (method === "turn/start") {
        return {
          turn: {
            id: "turn-new",
            items: [],
            status: "inProgress",
            error: null,
          },
        };
      }

      throw new Error(`unexpected method: ${method}`);
    });

    const result = await service.startTurnStream("thread-new", "hello");

    expect(result.turnId).toBe("turn-new");
    expect(service.threadResume).toHaveBeenCalledWith("thread-new");
    expect(service.request).toHaveBeenCalledWith("turn/start", {
      threadId: "thread-new",
      input: [{ type: "text", text: "hello" }],
    });
  });
});
