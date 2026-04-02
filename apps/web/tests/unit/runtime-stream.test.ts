import { describe, expect, it } from "vitest";

import { applyRuntimeEvents, consumeRuntimeEventStream, parseRuntimeEvent } from "../../src/lib/stream/runtime-stream";

describe("runtime-stream", () => {
  it("parses a runtime event payload", () => {
    const event = parseRuntimeEvent(
      JSON.stringify({
        type: "run.started",
        runId: "run-1",
        sessionId: "session-1",
        createdAt: "2026-04-02T00:00:00.000Z",
      }),
    );

    expect(event.type).toBe("run.started");
  });

  it("collects event types in order", () => {
    const result = applyRuntimeEvents([
      {
        type: "run.started",
        runId: "run-1",
        sessionId: "session-1",
        createdAt: "2026-04-02T00:00:00.000Z",
      },
      {
        type: "message.completed",
        runId: "run-1",
        messageId: "message-1",
        createdAt: "2026-04-02T00:00:01.000Z",
      },
      {
        type: "run.completed",
        runId: "run-1",
        sessionId: "session-1",
        createdAt: "2026-04-02T00:00:02.000Z",
      },
    ]);

    expect(result.eventTypes).toEqual(["run.started", "message.completed", "run.completed"]);
  });

  it("merges message deltas into a single message buffer", () => {
    const result = applyRuntimeEvents([
      {
        type: "message.delta",
        runId: "run-1",
        messageId: "message-1",
        delta: "hel",
        createdAt: "2026-04-02T00:00:00.000Z",
      },
      {
        type: "message.delta",
        runId: "run-1",
        messageId: "message-1",
        delta: "lo",
        createdAt: "2026-04-02T00:00:01.000Z",
      },
    ]);

    expect(result.messages).toEqual([{ messageId: "message-1", content: "hello" }]);
  });

  it("consumes ndjson runtime events from a streamed response", async () => {
    const chunks = [
      `${JSON.stringify({
        type: "run.started",
        runId: "run-1",
        sessionId: "session-1",
        createdAt: "2026-04-02T00:00:00.000Z",
      })}\n${JSON.stringify({
        type: "message.delta",
        runId: "run-1",
        messageId: "message-1",
        delta: "hel",
        createdAt: "2026-04-02T00:00:01.000Z",
      })}\n${JSON.stringify({
        type: "message.delta",
        runId: "run-1",
        messageId: "message-1",
        delta: "lo",
        createdAt: "2026-04-02T00:00:02.000Z",
      })}`.slice(0, 180),
      `${JSON.stringify({
        type: "run.started",
        runId: "run-1",
        sessionId: "session-1",
        createdAt: "2026-04-02T00:00:00.000Z",
      })}\n${JSON.stringify({
        type: "message.delta",
        runId: "run-1",
        messageId: "message-1",
        delta: "hel",
        createdAt: "2026-04-02T00:00:01.000Z",
      })}\n${JSON.stringify({
        type: "message.delta",
        runId: "run-1",
        messageId: "message-1",
        delta: "lo",
        createdAt: "2026-04-02T00:00:02.000Z",
      })}`.slice(180) + "\n",
      JSON.stringify({
        type: "run.completed",
        runId: "run-1",
        sessionId: "session-1",
        createdAt: "2026-04-02T00:00:03.000Z",
      }),
    ];

    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }

          controller.close();
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
      },
    );

    const events: Array<{ type: string; delta?: string }> = [];
    await consumeRuntimeEventStream(response, (event) => {
      events.push(event);
    });

    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "message.delta",
      "run.completed",
    ]);
    expect(events[1]?.delta).toBe("hel");
    expect(events[2]?.delta).toBe("lo");
  });
});
