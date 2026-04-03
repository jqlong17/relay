import { describe, expect, it } from "vitest";

import { SessionStore } from "../../src/services/session-store";

describe("SessionStore", () => {
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

  it("renames and removes a session", () => {
    const store = new SessionStore();
    const session = store.create("workspace-1", "Task A");

    const renamed = store.rename(session.id, "Task A renamed");

    expect(renamed?.title).toBe("Task A renamed");
    expect(store.remove(session.id)?.id).toBe(session.id);
    expect(store.get(session.id)).toBeUndefined();
  });
});
