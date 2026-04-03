import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeRuntimeEvents } from "../../src/lib/api/bridge";

type MockListener = (event: Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  withCredentials: boolean;
  readyState: number;
  close = vi.fn();
  private listeners = new Map<string, Set<MockListener>>();

  constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
    this.url = String(url);
    this.withCredentials = Boolean(eventSourceInitDict?.withCredentials);
    this.readyState = 1;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    const normalized = normalizeListener(listener);
    if (!normalized) {
      return;
    }

    const set = this.listeners.get(type) ?? new Set<MockListener>();
    set.add(normalized);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    const normalized = normalizeListener(listener);
    if (!normalized) {
      return;
    }

    this.listeners.get(type)?.delete(normalized);
  }

  emitMessage(data: string) {
    this.emit("message", new MessageEvent("message", { data }));
  }

  emitError() {
    this.emit("error", new Event("error"));
  }

  private emit(type: string, event: Event) {
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }
}

function normalizeListener(listener: EventListenerOrEventListenerObject | null): MockListener | null {
  if (!listener) {
    return null;
  }

  if (typeof listener === "function") {
    return listener as MockListener;
  }

  return (event: Event) => {
    listener.handleEvent(event);
  };
}

describe("bridge realtime subscription", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: MockEventSource,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: originalEventSource,
      writable: true,
    });
  });

  it("opens EventSource against runtime events endpoint and parses JSON payload", () => {
    const onEvent = vi.fn();
    const unsubscribe = subscribeRuntimeEvents(
      {
        sessionId: "session-1",
        workspaceId: "workspace-1",
      },
      onEvent,
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe(
      "/api/bridge/runtime/events?sessionId=session-1&workspaceId=workspace-1",
    );

    MockEventSource.instances[0]?.emitMessage(
      JSON.stringify({
        type: "run.started",
        runId: "run-1",
        sessionId: "session-1",
        createdAt: "2026-04-03T00:00:00.000Z",
      }),
    );

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.started",
        runId: "run-1",
        sessionId: "session-1",
      }),
    );

    unsubscribe();
    expect(MockEventSource.instances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed payloads instead of crashing", () => {
    const onEvent = vi.fn();
    subscribeRuntimeEvents({ sessionId: "session-1" }, onEvent);

    MockEventSource.instances[0]?.emitMessage("{not-json");
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("forwards EventSource error notifications", () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    subscribeRuntimeEvents({ sessionId: "session-1" }, onEvent, onError);

    MockEventSource.instances[0]?.emitError();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
