import { randomUUID } from "node:crypto";

import type { Message, MessageRole, Session } from "@relay/shared-types";

class SessionStore {
  private readonly sessions = new Map<string, Session>();

  create(workspaceId: string, title: string): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      workspaceId,
      title,
      turnCount: 0,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  list(workspaceId?: string): Session[] {
    const all = [...this.sessions.values()];
    return all
      .filter((session) => !workspaceId || session.workspaceId === workspaceId)
      .sort(compareSessionsByCreatedAtDesc);
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  remove(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    this.sessions.delete(sessionId);
    return session;
  }

  rename(sessionId: string, title: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.title = title;
    session.updatedAt = new Date().toISOString();
    return session;
  }

  appendMessage(sessionId: string, role: MessageRole, content: string): Message {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = new Date().toISOString();
    const message: Message = {
      id: randomUUID(),
      sessionId,
      role,
      content,
      status: "completed",
      sequence: session.messages.length + 1,
      createdAt: now,
      updatedAt: now,
    };

    session.messages.push(message);
    session.turnCount += role === "user" ? 1 : 0;
    session.updatedAt = now;

    return message;
  }

  replaceMessages(sessionId: string, messages: Message[]) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.messages = messages;
    session.turnCount = messages.filter((message) => message.role === "user").length;
    session.updatedAt = new Date().toISOString();
  }
}

function compareSessionsByCreatedAtDesc(a: Session, b: Session) {
  return b.createdAt.localeCompare(a.createdAt);
}

export { SessionStore };
