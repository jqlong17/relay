import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";

import { readJsonBody } from "./json-body";
import {
  CodexAppServerService,
  type AppServerThread,
  type AppServerTurn,
  type AppServerUserInput,
} from "../services/codex-app-server";
import { classifyBrokenThreadError, isThreadNotFoundError, type BrokenThreadReason } from "../services/broken-thread";
import { RuntimeEventBus } from "../services/runtime-event-bus";
import { SessionStore } from "../services/session-store";
import { WorkspaceStore } from "../services/workspace-store";
import type { Message, Session } from "@relay/shared-types";

const THREAD_LIST_CACHE_TTL_MS = 15_000;
const threadListCache = new Map<string, { fetchedAt: number; items: Session[] }>();
const threadListRefreshes = new Map<string, Promise<Session[]>>();
const sessionDetailRefreshes = new Map<string, Promise<Session | null>>();
const brokenThreadStates = new Map<string, BrokenThreadState>();

type SessionSyncState = "idle" | "running" | "syncing" | "stale" | "broken";

type BridgeSession = Session & {
  cwd?: string;
  source?: "fresh" | "snapshot";
  syncState?: SessionSyncState;
  brokenReason?: BrokenThreadReason;
};

type BrokenThreadState = {
  reason: BrokenThreadReason;
  updatedAt: string;
  workspaceId?: string;
};

type ReadThreadResult =
  | { kind: "ok"; thread: AppServerThread }
  | { kind: "broken"; reason: BrokenThreadReason }
  | { kind: "not_found" };

async function handleSessionsRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  sessionStore: SessionStore,
  codexAppServerService: CodexAppServerService,
  runtimeEventBus: RuntimeEventBus,
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
        items = [...snapshot.items, ...sessionItems].sort(compareSessionsByCreatedAtDesc);
        source = "snapshot";
        void refreshThreadSummaries(codexAppServerService, workspaceStore, activeWorkspace.localPath, activeWorkspace.id);
      } else {
        try {
          items = [
            ...(await getFreshThreadSummaries(
              codexAppServerService,
              workspaceStore,
              activeWorkspace.localPath,
              activeWorkspace.id,
            )),
            ...sessionItems,
          ].sort(compareSessionsByCreatedAtDesc);
        } catch {
          items = [...(snapshot?.items ?? []), ...sessionItems].sort(compareSessionsByCreatedAtDesc);
          source = "snapshot";
        }
      }
    }

    const preferredSessionId = activeWorkspace
      ? workspaceStore.getPreferredSessionId(activeWorkspace.id)
      : null;
    const responseItems = items.map((item) => withBrokenState(item));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        items: responseItems,
        activeWorkspaceId: activeWorkspace?.id ?? null,
        preferredSessionId,
        source,
        broken: collectBrokenItems(responseItems),
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
    publishThreadListChanged(runtimeEventBus, activeWorkspace.id, item.id);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item }));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname.startsWith("/sessions/") && requestUrl.pathname.endsWith("/select")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "").replace("/select", "");
    const draftSession = sessionStore.get(sessionId);
    if (draftSession) {
      workspaceStore.setPreferredSessionId(draftSession.workspaceId, sessionId);
      publishThreadUpdated(runtimeEventBus, sessionId, draftSession.workspaceId);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, sessionId, workspaceId: draftSession.workspaceId }));
      return true;
    }

    const readResult = await readThreadWithTurnsFallback(codexAppServerService, sessionId);

    if (readResult.kind === "not_found") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    if (readResult.kind === "broken") {
      const activeWorkspace = workspaceStore.getActive();
      markBrokenThread(sessionId, readResult.reason, activeWorkspace?.id);
      if (activeWorkspace) {
        workspaceStore.setPreferredSessionId(activeWorkspace.id, sessionId);
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: false,
          sessionId,
          workspaceId: activeWorkspace?.id ?? null,
          syncState: "broken",
          brokenReason: readResult.reason,
        }),
      );
      return true;
    }

    clearBrokenThread(sessionId);
    const thread = readResult.thread;
    const workspaceId = resolveWorkspaceId(workspaceStore, thread.cwd);
    workspaceStore.setPreferredSessionId(workspaceId, sessionId);
    publishThreadUpdated(runtimeEventBus, sessionId, workspaceId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, sessionId, workspaceId }));
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/sessions/")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "");
    const knownBroken = brokenThreadStates.get(sessionId);
    const draftSession = sessionStore.get(sessionId);
    if (draftSession) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ item: draftSession, source: "fresh" }));
      return true;
    }

    if (!forceFresh && knownBroken) {
      const snapshot = workspaceStore.getSessionDetailSnapshot(sessionId);
      const item = withBrokenState(snapshot ?? createBrokenSession(sessionId, knownBroken.workspaceId), knownBroken);

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          item,
          source: snapshot ? "snapshot" : "fresh",
          syncState: "broken",
          brokenReason: knownBroken.reason,
        }),
      );
      return true;
    }

    if (!forceFresh) {
      const snapshot = workspaceStore.getSessionDetailSnapshot(sessionId);
      if (snapshot) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ item: withBrokenState(snapshot), source: "snapshot" }));
        void refreshSessionDetail(codexAppServerService, workspaceStore, sessionId);
        return true;
      }
    }

    const readResult = await readThreadWithTurnsFallback(codexAppServerService, sessionId);

    if (readResult.kind === "not_found") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    if (readResult.kind === "broken") {
      const activeWorkspace = workspaceStore.getActive();
      markBrokenThread(sessionId, readResult.reason, activeWorkspace?.id);
      const item = withBrokenState(createBrokenSession(sessionId, activeWorkspace?.id), {
        reason: readResult.reason,
        updatedAt: new Date().toISOString(),
        workspaceId: activeWorkspace?.id,
      });

      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          item,
          source: "fresh",
          syncState: "broken",
          brokenReason: readResult.reason,
        }),
      );
      return true;
    }

    const thread = readResult.thread;
    clearBrokenThread(sessionId);
    const item = mapThreadToSessionDetail(thread, resolveWorkspaceId(workspaceStore, thread.cwd));
    workspaceStore.saveSessionDetailSnapshot(item);

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item: withBrokenState(item), source: "fresh" }));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname.startsWith("/sessions/") && requestUrl.pathname.endsWith("/archive")) {
    const sessionId = requestUrl.pathname.replace("/sessions/", "").replace("/archive", "");
    const draftSession = sessionStore.remove(sessionId);
    if (draftSession) {
      invalidateThreadListCacheForAllWorkspaces(workspaceStore);
      workspaceStore.clearSessionDetailSnapshot(sessionId);
      workspaceStore.clearPreferredSessionId(draftSession.workspaceId, sessionId);
      publishThreadDeletedOrMissing(runtimeEventBus, sessionId, draftSession.workspaceId);
      publishThreadListChanged(runtimeEventBus, draftSession.workspaceId, sessionId);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, archivedSessionId: sessionId }));
      return true;
    }

    await codexAppServerService.threadArchive(sessionId);
    invalidateThreadListCacheForAllWorkspaces(workspaceStore);
    workspaceStore.clearSessionDetailSnapshot(sessionId);
    clearPreferredSessionIdAcrossWorkspaces(workspaceStore, sessionId);
    publishThreadDeletedOrMissing(runtimeEventBus, sessionId);
    publishThreadListChanged(runtimeEventBus, null, sessionId);
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
    const readResult = await readThreadWithTurnsFallback(codexAppServerService, sessionId);

    if (readResult.kind === "not_found") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    if (readResult.kind === "broken") {
      markBrokenThread(sessionId, readResult.reason);
      response.writeHead(409, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: "Session is unavailable",
          syncState: "broken",
          brokenReason: readResult.reason,
        }),
      );
      return true;
    }

    const thread = readResult.thread;
    clearBrokenThread(sessionId);
    const item = mapThreadToSessionDetail(thread, resolveWorkspaceId(workspaceStore, thread.cwd));
    workspaceStore.saveSessionDetailSnapshot(item);
    invalidateThreadListCache(thread.cwd);
    publishThreadUpdated(runtimeEventBus, sessionId, item.workspaceId);
    publishThreadListChanged(runtimeEventBus, item.workspaceId, sessionId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, item: withBrokenState(item) }));
    return true;
  }

  return false;
}

export { handleSessionsRoute };

async function readThreadWithTurnsFallback(
  codexAppServerService: CodexAppServerService,
  threadId: string,
) : Promise<ReadThreadResult> {
  let firstError: unknown = null;

  try {
    return { kind: "ok", thread: await codexAppServerService.threadRead(threadId, true) };
  } catch (error) {
    firstError = error;
  }

  try {
    return { kind: "ok", thread: await codexAppServerService.threadRead(threadId, false) };
  } catch (fallbackError) {
    const brokenReason =
      classifyBrokenThreadError(fallbackError) ?? classifyBrokenThreadError(firstError);
    if (brokenReason) {
      return { kind: "broken", reason: brokenReason };
    }

    if (isThreadNotFoundError(fallbackError) || isThreadNotFoundError(firstError)) {
      return { kind: "not_found" };
    }

    return { kind: "broken", reason: "thread_read_failed" };
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
    .then((result) => {
      if (result.kind === "not_found") {
        workspaceStore.clearSessionDetailSnapshot(sessionId);
        clearBrokenThread(sessionId);
        return null;
      }

      if (result.kind === "broken") {
        const snapshot = workspaceStore.getSessionDetailSnapshot(sessionId);
        markBrokenThread(sessionId, result.reason, snapshot?.workspaceId);
        return snapshot ? withBrokenState(snapshot, brokenThreadStates.get(sessionId)) : null;
      }

      const thread = result.thread;
      clearBrokenThread(sessionId);
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

function mapThreadToSessionSummary(thread: AppServerThread, workspaceId: string): BridgeSession {
  return {
    id: thread.id,
    workspaceId,
    title: thread.name ?? deriveTitle(thread),
    turnCount: thread.turns.length,
    messages: [],
    cwd: thread.cwd,
    source: "fresh",
    syncState: "idle",
    createdAt: fromUnixSeconds(thread.createdAt),
    updatedAt: fromUnixSeconds(thread.updatedAt),
  };
}

function mapThreadToSessionDetail(thread: AppServerThread, workspaceId: string): BridgeSession {
  const messages = flattenTurnsToMessages(thread.id, thread.turns, thread.createdAt);

  return {
    id: thread.id,
    workspaceId,
    title: thread.name ?? deriveTitle(thread),
    turnCount: messages.filter((message) => message.role === "user").length,
    messages,
    cwd: thread.cwd,
    source: "fresh",
    syncState: "idle",
    createdAt: fromUnixSeconds(thread.createdAt),
    updatedAt: fromUnixSeconds(thread.updatedAt),
  };
}

function flattenTurnsToMessages(sessionId: string, turns: AppServerTurn[], createdAt: number): Message[] {
  const messages: Message[] = [];
  const baseMs = createdAt * 1000;

  turns.forEach((turn, turnIndex) => {
    turn.items.forEach((item, itemIndex) => {
      if (
        item.type !== "userMessage" &&
        item.type !== "agentMessage" &&
        item.type !== "plan" &&
        item.type !== "reasoning" &&
        item.type !== "commandExecution"
      ) {
        return;
      }

      const sequence = messages.length + 1;
      const timestamp = new Date(baseMs + (turnIndex * 10 + itemIndex) * 1000).toISOString();
      const content = formatThreadItemContent(item);

      messages.push({
        id: item.id,
        sessionId,
        role:
          item.type === "userMessage"
            ? "user"
            : item.type === "agentMessage"
              ? "assistant"
              : "system",
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

function formatUserMessageContent(content: AppServerUserInput[]) {
  return content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }

      if (part.type === "localImage") {
        return `[Image: ${path.basename(part.path)}]`;
      }

      return "[Image URL]";
    })
    .filter(Boolean)
    .join("\n");
}

function formatThreadItemContent(
  item:
    | { type: "userMessage"; id: string; content: AppServerUserInput[] }
    | { type: "agentMessage"; id: string; text: string }
    | { type: "plan"; id: string; text: string }
    | { type: "reasoning"; id: string; summary?: string[]; content?: string[] }
    | { type: "commandExecution"; id: string; command: string; aggregatedOutput?: string | null },
) {
  if (item.type === "userMessage") {
    return formatUserMessageContent(item.content);
  }

  if (item.type === "agentMessage") {
    return item.text;
  }

  if (item.type === "plan") {
    return `**Plan**\n${item.text}`;
  }

  if (item.type === "reasoning") {
    const reasoningText = item.summary?.join("") || item.content?.join("") || "";
    return `**Thinking**\n${reasoningText}`;
  }

  const output = item.aggregatedOutput?.trim() ? `\n${item.aggregatedOutput}` : "";
  return `**Command**\n$ ${item.command}${output}`;
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

function compareSessionsByCreatedAtDesc(a: Session, b: Session) {
  return b.createdAt.localeCompare(a.createdAt);
}

function createBrokenSession(sessionId: string, workspaceId?: string): BridgeSession {
  const now = new Date().toISOString();

  return {
    id: sessionId,
    workspaceId: workspaceId ?? "workspace-broken",
    title: "Broken Session",
    turnCount: 0,
    messages: [],
    source: "fresh",
    syncState: "broken",
    brokenReason: "thread_read_failed",
    createdAt: now,
    updatedAt: now,
  };
}

function markBrokenThread(sessionId: string, reason: BrokenThreadReason, workspaceId?: string) {
  brokenThreadStates.set(sessionId, {
    reason,
    updatedAt: new Date().toISOString(),
    workspaceId,
  });
}

function clearBrokenThread(sessionId: string) {
  brokenThreadStates.delete(sessionId);
}

function withBrokenState(session: Session, state = brokenThreadStates.get(session.id)): BridgeSession {
  if (!state) {
    return session as BridgeSession;
  }

  return {
    ...(session as BridgeSession),
    syncState: "broken",
    brokenReason: state.reason,
  };
}

function collectBrokenItems(items: Session[]) {
  return items
    .map((item) => {
      const state = brokenThreadStates.get(item.id);
      if (!state) {
        return null;
      }

      return {
        sessionId: item.id,
        reason: state.reason,
        updatedAt: state.updatedAt,
      };
    })
    .filter((item): item is { sessionId: string; reason: BrokenThreadReason; updatedAt: string } => item !== null);
}

function publishThreadUpdated(
  runtimeEventBus: RuntimeEventBus,
  sessionId: string,
  workspaceId: string | null,
) {
  runtimeEventBus.publish({
    type: "thread.updated",
    sessionId,
    workspaceId,
    createdAt: new Date().toISOString(),
  });
}

function publishThreadListChanged(
  runtimeEventBus: RuntimeEventBus,
  workspaceId: string | null,
  sessionId?: string,
) {
  runtimeEventBus.publish({
    type: "thread.list.changed",
    sessionId,
    workspaceId,
    createdAt: new Date().toISOString(),
  });
}

function publishThreadDeletedOrMissing(
  runtimeEventBus: RuntimeEventBus,
  sessionId: string,
  workspaceId?: string,
) {
  runtimeEventBus.publish({
    type: "thread.deleted_or_missing",
    sessionId,
    workspaceId: workspaceId ?? null,
    createdAt: new Date().toISOString(),
  });
}
