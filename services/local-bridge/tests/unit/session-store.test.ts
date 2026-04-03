import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionStore } from "../../src/services/session-store";

describe("SessionStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a session", () => {
    const store = new SessionStore();

    const session = store.create("workspace-1", "Initial task");

    expect(session.workspaceId).toBe("workspace-1");
    expect(session.title).toBe("Initial task");
    expect(session.messages).toHaveLength(0);
  });

  it("appends a message to an existing session", () => {
    const store = new SessionStore();
    const session = store.create("workspace-1", "Initial task");

    const message = store.appendMessage(session.id, "user", "Hello Relay");

    expect(message.sequence).toBe(1);
    expect(store.get(session.id)?.messages).toHaveLength(1);
    expect(store.get(session.id)?.turnCount).toBe(1);
  });

  it("lists sessions for a workspace", () => {
    const store = new SessionStore();
    store.create("workspace-1", "Task A");
    store.create("workspace-2", "Task B");

    const sessions = store.list("workspace-1");

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.workspaceId).toBe("workspace-1");
  });

  it("keeps workspace session order by creation time even after updates", () => {
    vi.useFakeTimers();
    const store = new SessionStore();

    vi.setSystemTime(new Date("2026-04-03T00:00:00.000Z"));
    const firstSession = store.create("workspace-1", "Task A");

    vi.setSystemTime(new Date("2026-04-03T00:10:00.000Z"));
    const secondSession = store.create("workspace-1", "Task B");

    vi.setSystemTime(new Date("2026-04-03T00:20:00.000Z"));
    store.appendMessage(firstSession.id, "user", "Bump updated time");

    const sessions = store.list("workspace-1");

    expect(sessions.map((session) => session.id)).toEqual([secondSession.id, firstSession.id]);
  });

  it("renames and removes a session", () => {
    const store = new SessionStore();
    const session = store.create("workspace-1", "Task A");

    const renamed = store.rename(session.id, "Task A renamed");

    expect(renamed?.title).toBe("Task A renamed");
    expect(store.remove(session.id)?.id).toBe(session.id);
    expect(store.get(session.id)).toBeUndefined();
  });
});
