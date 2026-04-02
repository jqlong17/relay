import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";

import { readJsonBody } from "./json-body";
import { CodexAppServerService, type AppServerThread, type AppServerTurn } from "../services/codex-app-server";
import { WorkspaceStore } from "../services/workspace-store";
import type { Message, Session } from "@relay/shared-types";

async function handleSessionsRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  codexAppServerService: CodexAppServerService,
) {
  if (request.method === "GET" && request.url === "/sessions") {
    const activeWorkspace = workspaceStore.getActive();
    const items = activeWorkspace
      ? (await codexAppServerService.threadList({ cwd: activeWorkspace.localPath })).map((thread) =>
          mapThreadToSessionSummary(thread, activeWorkspace.id),
        )
      : [];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ items, activeWorkspaceId: activeWorkspace?.id ?? null }));
    return true;
  }

  if (request.method === "POST" && request.url === "/sessions") {
    const activeWorkspace = workspaceStore.getActive();

    if (!activeWorkspace) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "No active workspace" }));
      return true;
    }

    const body = await readJsonBody<{ title: string }>(request);
    const thread = await codexAppServerService.threadStart({ cwd: activeWorkspace.localPath });
    await codexAppServerService.threadSetName(thread.id, body.title);
    const refreshedThread = await codexAppServerService.threadRead(thread.id, false);
    const item = mapThreadToSessionSummary(refreshedThread, activeWorkspace.id);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item }));
    return true;
  }

  if (request.method === "GET" && request.url?.startsWith("/sessions/")) {
    const sessionId = request.url.replace("/sessions/", "");
    const thread = await readThreadWithTurnsFallback(codexAppServerService, sessionId);

    if (!thread) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    const item = mapThreadToSessionDetail(thread, resolveWorkspaceId(workspaceStore, thread.cwd));

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item }));
    return true;
  }

  if (request.method === "POST" && request.url?.startsWith("/sessions/") && request.url.endsWith("/archive")) {
    const sessionId = request.url.replace("/sessions/", "").replace("/archive", "");
    await codexAppServerService.threadArchive(sessionId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, archivedSessionId: sessionId }));
    return true;
  }

  if (request.method === "POST" && request.url?.startsWith("/sessions/") && request.url.endsWith("/rename")) {
    const sessionId = request.url.replace("/sessions/", "").replace("/rename", "");
    const body = await readJsonBody<{ title: string }>(request);
    const title = body.title.trim();

    if (!title) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Missing session title" }));
      return true;
    }

    await codexAppServerService.threadSetName(sessionId, title);
    const thread = await readThreadWithTurnsFallback(codexAppServerService, sessionId);

    if (!thread) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    const item = mapThreadToSessionDetail(thread, resolveWorkspaceId(workspaceStore, thread.cwd));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, item }));
    return true;
  }

  return false;
}

export { handleSessionsRoute };

async function readThreadWithTurnsFallback(
  codexAppServerService: CodexAppServerService,
  threadId: string,
) {
  try {
    return await codexAppServerService.threadRead(threadId, true);
  } catch {
    return codexAppServerService.threadRead(threadId, false).catch(() => null);
  }
}

function resolveWorkspaceId(workspaceStore: WorkspaceStore, cwd: string) {
  return workspaceStore.findByLocalPath(cwd)?.id ?? createWorkspaceIdFromPath(cwd);
}

function createWorkspaceIdFromPath(localPath: string) {
  return `workspace-${createHash("sha1").update(localPath).digest("hex").slice(0, 12)}`;
}

function mapThreadToSessionSummary(thread: AppServerThread, workspaceId: string): Session {
  return {
    id: thread.id,
    workspaceId,
    title: thread.name ?? deriveTitle(thread),
    turnCount: thread.turns.length,
    messages: [],
    createdAt: fromUnixSeconds(thread.createdAt),
    updatedAt: fromUnixSeconds(thread.updatedAt),
  };
}

function mapThreadToSessionDetail(thread: AppServerThread, workspaceId: string): Session {
  const messages = flattenTurnsToMessages(thread.id, thread.turns, thread.createdAt);

  return {
    id: thread.id,
    workspaceId,
    title: thread.name ?? deriveTitle(thread),
    turnCount: messages.filter((message) => message.role === "user").length,
    messages,
    createdAt: fromUnixSeconds(thread.createdAt),
    updatedAt: fromUnixSeconds(thread.updatedAt),
  };
}

function flattenTurnsToMessages(sessionId: string, turns: AppServerTurn[], createdAt: number): Message[] {
  const messages: Message[] = [];
  const baseMs = createdAt * 1000;

  turns.forEach((turn, turnIndex) => {
    turn.items.forEach((item, itemIndex) => {
      if (item.type !== "userMessage" && item.type !== "agentMessage") {
        return;
      }

      const sequence = messages.length + 1;
      const timestamp = new Date(baseMs + (turnIndex * 10 + itemIndex) * 1000).toISOString();
      const content =
        item.type === "userMessage"
          ? item.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n")
          : item.text;

      messages.push({
        id: item.id,
        sessionId,
        role: item.type === "userMessage" ? "user" : "assistant",
        content,
        status: turn.status === "failed" ? "error" : "completed",
        sequence,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  });

  return messages;
}

function deriveTitle(thread: AppServerThread) {
  const preview = thread.preview.trim();

  if (!preview) {
    return "New Session";
  }

  return preview.length > 48 ? `${preview.slice(0, 48)}…` : preview;
}

function fromUnixSeconds(value: number) {
  return new Date(value * 1000).toISOString();
}
