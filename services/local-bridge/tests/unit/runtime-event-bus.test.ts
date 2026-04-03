import { describe, expect, it } from "vitest";

import { RuntimeEventBus } from "../../src/services/runtime-event-bus";

describe("runtime event bus", () => {
  it("routes message delta events to a session subscriber by run id", () => {
    const bus = new RuntimeEventBus();
    const events: Array<{ type: string }> = [];

    bus.subscribe((event) => {
      events.push(event);
    }, { sessionId: "session-1" });

    bus.publish({
      type: "run.started",
      runId: "run-1",
      sessionId: "session-1",
      createdAt: new Date().toISOString(),
    });
    bus.publish({
      type: "message.delta",
      runId: "run-1",
      messageId: "message-1",
      delta: "hello",
      createdAt: new Date().toISOString(),
    });
    bus.publish({
      type: "message.completed",
      runId: "run-1",
      messageId: "message-1",
      createdAt: new Date().toISOString(),
    });
    bus.publish({
      type: "run.completed",
      runId: "run-1",
      sessionId: "session-1",
      createdAt: new Date().toISOString(),
    });

    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "message.completed",
      "run.completed",
    ]);
  });

  it("does not leak events to a different session subscriber", () => {
    const bus = new RuntimeEventBus();
    const received: Array<{ type: string }> = [];

    bus.subscribe((event) => {
      received.push(event);
    }, { sessionId: "session-2" });

    bus.publish({
      type: "run.started",
      runId: "run-1",
      sessionId: "session-1",
      createdAt: new Date().toISOString(),
    });
    bus.publish({
      type: "message.delta",
      runId: "run-1",
      messageId: "message-1",
      delta: "hello",
      createdAt: new Date().toISOString(),
    });
    bus.publish({
      type: "thread.updated",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      createdAt: new Date().toISOString(),
    });

    expect(received).toHaveLength(0);
  });

  it("supports unsubscribe", () => {
    const bus = new RuntimeEventBus();
    const received: Array<{ type: string }> = [];

    const unsubscribe = bus.subscribe((event) => {
      received.push(event);
    });

    bus.publish({
      type: "thread.list.changed",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      createdAt: new Date().toISOString(),
    });
    unsubscribe();
    bus.publish({
      type: "thread.list.changed",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      createdAt: new Date().toISOString(),
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("thread.list.changed");
  });

  it("supports workspace scoped subscriptions", () => {
    const bus = new RuntimeEventBus();
    const received: Array<{ type: string }> = [];

    bus.subscribe((event) => {
      received.push(event);
    }, { workspaceId: "workspace-1" });

    bus.publish({
      type: "thread.list.changed",
      workspaceId: "workspace-2",
      createdAt: new Date().toISOString(),
    });
    bus.publish({
      type: "thread.updated",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      createdAt: new Date().toISOString(),
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("thread.updated");
  });
});
