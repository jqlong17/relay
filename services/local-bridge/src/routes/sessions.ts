import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";

import { readJsonBody } from "./json-body";
import { CodexAppServerService, type AppServerThread, type AppServerTurn } from "../services/codex-app-server";
import { SessionStore } from "../services/session-store";
import { WorkspaceStore } from "../services/workspace-store";
import type { Message, Session } from "@relay/shared-types";

const THREAD_LIST_CACHE_TTL_MS = 15_000;
const threadListCache = new Map<string, { fetchedAt: number; items: Session[] }>();
const threadListRefreshes = new Map<string, Promise<Session[]>>();
const sessionDetailRefreshes = new Map<string, Promise<Session | null>>();

async function handleSessionsRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  sessionStore: SessionStore,
  codexAppServerService: CodexAppServerService,
) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const forceFresh = requestUrl.searchParams.get("fresh") === "1";

  if (request.method === "GET" && requestUrl.pathname === "/sessions") {
    const activeWorkspace = workspaceStore.getActive();
    const sessionItems = activeWorkspace
      ? sessionStore.list(activeWorkspace.id)
      : [];
    const snapshot = activeWorkspace
      ? workspaceStore.getSessionListSnapshot(activeWorkspace.id)
      : null;
    let items: Session[] = [];
    let source: "fresh" | "snapshot" = "fresh";

    if (activeWorkspace) {
      if (!forceFresh && snapshot) {
        items = [...snapshot.items, ...sessionItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        source = "snapshot";
        void refreshThreadSummaries(codexAppServerService, workspaceStore, activeWorkspace.localPath, activeWorkspace.id);
      } else {
        items = [
          ...(await getFreshThreadSummaries(
            codexAppServerService,
            workspaceStore,
            activeWorkspace.localPath,
            activeWorkspace.id,
          )),
          ...sessionItems,
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }
    }

    const preferredSessionId = activeWorkspace
      ? workspaceStore.getPreferredSessionId(activeWorkspace.id)
      : null;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        items,
        activeWorkspaceId: activeWorkspace?.id ?? null,
        preferredSessionId,
        source,
      }),
    );
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/sessions") {
    const activeWorkspace = workspaceStore.getActive();

    if (!activeWorkspace) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "No active workspace" }));
      return true;
    }

    const body = await readJsonBody<{ title: string }>(request);
    const item = sessionStore.create(activeWorkspace.id, body.title.trim() || "New Session");
    invalidateThreadListCache(activeWorkspace.localPath);
    workspaceStore.setPreferredSessionId(activeWorkspace.id, item.id);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item }));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname.startsWith("/sessions/") && requestUrl.pathname.endsWith("/select")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "").replace("/select", "");
    const draftSession = sessionStore.get(sessionId);
    if (draftSession) {
      workspaceStore.setPreferredSessionId(draftSession.workspaceId, sessionId);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, sessionId, workspaceId: draftSession.workspaceId }));
      return true;
    }

    const thread = await readThreadWithTurnsFallback(codexAppServerService, sessionId);

    if (!thread) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    const workspaceId = resolveWorkspaceId(workspaceStore, thread.cwd);
    workspaceStore.setPreferredSessionId(workspaceId, sessionId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, sessionId, workspaceId }));
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/sessions/")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "");
    const draftSession = sessionStore.get(sessionId);
    if (draftSession) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ item: draftSession, source: "fresh" }));
      return true;
    }

    if (!forceFresh) {
      const snapshot = workspaceStore.getSessionDetailSnapshot(sessionId);
      if (snapshot) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ item: snapshot, source: "snapshot" }));
        void refreshSessionDetail(codexAppServerService, workspaceStore, sessionId);
        return true;
      }
    }

    const thread = await readThreadWithTurnsFallback(codexAppServerService, sessionId);

    if (!thread) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    const item = mapThreadToSessionDetail(thread, resolveWorkspaceId(workspaceStore, thread.cwd));
    workspaceStore.saveSessionDetailSnapshot(item);

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item, source: "fresh" }));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname.startsWith("/sessions/") && requestUrl.pathname.endsWith("/archive")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "").replace("/archive", "");
    const draftSession = sessionStore.remove(sessionId);
    if (draftSession) {
      invalidateThreadListCacheForAllWorkspaces(workspaceStore);
      workspaceStore.clearSessionDetailSnapshot(sessionId);
      workspaceStore.clearPreferredSessionId(draftSession.workspaceId, sessionId);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, archivedSessionId: sessionId }));
      return true;
    }

    await codexAppServerService.threadArchive(sessionId);
    invalidateThreadListCacheForAllWorkspaces(workspaceStore);
    workspaceStore.clearSessionDetailSnapshot(sessionId);
    clearPreferredSessionIdAcrossWorkspaces(workspaceStore, sessionId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, archivedSessionId: sessionId }));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname.startsWith("/sessions/") && requestUrl.pathname.endsWith("/rename")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "").replace("/rename", "");
    const body = await readJsonBody<{ title: string }>(request);
    const title = body.title.trim();

    if (!title) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Missing session title" }));
      return true;
    }

    const renamedDraft = sessionStore.rename(sessionId, title);
    if (renamedDraft) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, item: renamedDraft }));
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
    workspaceStore.saveSessionDetailSnapshot(item);
    invalidateThreadListCache(thread.cwd);
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

async function getCachedThreadSummaries(
  codexAppServerService: CodexAppServerService,
  workspaceStore: WorkspaceStore,
  cwd: string,
  workspaceId: string,
) {
  const cached = threadListCache.get(cwd);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < THREAD_LIST_CACHE_TTL_MS) {
    return cached.items;
  }

  return getFreshThreadSummaries(codexAppServerService, workspaceStore, cwd, workspaceId);
}

function invalidateThreadListCache(cwd: string) {
  threadListCache.delete(cwd);
  threadListRefreshes.delete(cwd);
}

function invalidateThreadListCacheForAllWorkspaces(workspaceStore: WorkspaceStore) {
  for (const workspace of workspaceStore.list()) {
    invalidateThreadListCache(workspace.localPath);
  }
}

function clearPreferredSessionIdAcrossWorkspaces(workspaceStore: WorkspaceStore, sessionId: string) {
  for (const workspace of workspaceStore.list()) {
    workspaceStore.clearPreferredSessionId(workspace.id, sessionId);
  }
}

async function getFreshThreadSummaries(
  codexAppServerService: CodexAppServerService,
  workspaceStore: WorkspaceStore,
  cwd: string,
  workspaceId: string,
) {
  const items = (await codexAppServerService.threadList({ cwd })).map((thread) =>
    mapThreadToSessionSummary(thread, workspaceId),
  );

  threadListCache.set(cwd, {
    fetchedAt: Date.now(),
    items,
  });
  workspaceStore.saveSessionListSnapshot(workspaceId, items);

  return items;
}

function refreshThreadSummaries(
  codexAppServerService: CodexAppServerService,
  workspaceStore: WorkspaceStore,
  cwd: string,
  workspaceId: string,
) {
  const pending = threadListRefreshes.get(cwd);
  if (pending) {
    return pending;
  }

  const refresh = getFreshThreadSummaries(codexAppServerService, workspaceStore, cwd, workspaceId)
    .finally(() => {
      threadListRefreshes.delete(cwd);
    });

  threadListRefreshes.set(cwd, refresh);
  return refresh;
}

function refreshSessionDetail(
  codexAppServerService: CodexAppServerService,
  workspaceStore: WorkspaceStore,
  sessionId: string,
) {
  const pending = sessionDetailRefreshes.get(sessionId);
  if (pending) {
    return pending;
  }

  const refresh = readThreadWithTurnsFallback(codexAppServerService, sessionId)
    .then((thread) => {
      if (!thread) {
        workspaceStore.clearSessionDetailSnapshot(sessionId);
        return null;
      }

      const session = mapThreadToSessionDetail(thread, resolveWorkspaceId(workspaceStore, thread.cwd));
      workspaceStore.saveSessionDetailSnapshot(session);
      return session;
    })
    .finally(() => {
      sessionDetailRefreshes.delete(sessionId);
    });

  sessionDetailRefreshes.set(sessionId, refresh);
  return refresh;
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
