import type { IncomingMessage, ServerResponse } from "node:http";

import type { Message, RuntimeEvent } from "@relay/shared-types";

import { readJsonBody } from "./json-body";
import { CodexAppServerService, type AppServerNotification } from "../services/codex-app-server";
import { SessionStore } from "../services/session-store";
import { WorkspaceStore } from "../services/workspace-store";

async function handleRuntimeRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  sessionStore: SessionStore,
  codexAppServerService: CodexAppServerService,
) {
  const runtimeUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "POST" && runtimeUrl.pathname === "/runtime/run") {
    const body = await readJsonBody<{ sessionId: string; content: string }>(request);
    const draftSession = sessionStore.get(body.sessionId);
    const draftWorkspace = draftSession ? workspaceStore.get(draftSession.workspaceId) : null;

    let sessionId = body.sessionId;
    let thread =
      draftSession && draftWorkspace
        ? await codexAppServerService.threadStart({ cwd: draftWorkspace.localPath })
        : await codexAppServerService.threadRead(body.sessionId, false).catch(() => null);

    if (!thread) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    if (draftSession) {
      await codexAppServerService.threadSetName(thread.id, draftSession.title);
      sessionStore.remove(draftSession.id);
      workspaceStore.setPreferredSessionId(draftSession.workspaceId, thread.id);
      sessionId = thread.id;
    }

    const turnStream = await codexAppServerService.startTurnStream(sessionId, body.content);
    const stream = mapAppServerNotificationsToRuntimeEvents(
      sessionId,
      turnStream.turnId,
      turnStream.notifications,
    );

    if (runtimeUrl.searchParams.get("stream") === "1") {
      response.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });

      await writeRuntimeEventStream(response, stream);
      await syncSessionSnapshot(codexAppServerService, workspaceStore, sessionId);
      response.end();
      return true;
    }

    const events = await collectRuntimeEvents(stream);
    await syncSessionSnapshot(codexAppServerService, workspaceStore, sessionId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ sessionId, events }));
    return true;
  }

  return false;
}

async function collectRuntimeEvents(stream: AsyncIterable<RuntimeEvent>) {
  const events: RuntimeEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

async function writeRuntimeEventStream(
  response: ServerResponse<IncomingMessage>,
  stream: AsyncIterable<RuntimeEvent>,
) {
  const events: RuntimeEvent[] = [];

  for await (const event of stream) {
    events.push(event);
    response.write(`${JSON.stringify(event)}\n`);
  }

  return events;
}

export { handleRuntimeRoute };

async function syncSessionSnapshot(
  codexAppServerService: CodexAppServerService,
  workspaceStore: WorkspaceStore,
  sessionId: string,
) {
  try {
    const thread = await codexAppServerService.threadRead(sessionId, true);
    const workspaceId = workspaceStore.findByLocalPath(thread.cwd)?.id ?? null;

    if (!workspaceId) {
      return;
    }

    workspaceStore.saveSessionDetailSnapshot(mapThreadToSessionDetail(thread, workspaceId));
    workspaceStore.clearSessionListSnapshot(workspaceId);
  } catch {
    // Ignore snapshot sync failures after runs.
  }
}

function mapThreadToSessionDetail(
  thread: {
    id: string;
    preview: string;
    createdAt: number;
    updatedAt: number;
    turns: Array<{
      status: "inProgress" | "completed" | "interrupted" | "failed";
      items: Array<
        | { type: "userMessage"; id: string; content: Array<{ type: "text"; text: string }> }
        | { type: "agentMessage"; id: string; text: string }
        | { type: string; id: string }
      >;
    }>;
  },
  workspaceId: string,
) {
  const messages: Message[] = [];
  const baseMs = thread.createdAt * 1000;

  thread.turns.forEach((turn, turnIndex) => {
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
        sessionId: thread.id,
        role: item.type === "userMessage" ? "user" : "assistant",
        content,
        status: turn.status === "failed" ? "error" : "completed",
        sequence,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  });

  return {
    id: thread.id,
    workspaceId,
    title: deriveTitle(thread.preview),
    turnCount: messages.filter((message) => message.role === "user").length,
    messages,
    createdAt: new Date(thread.createdAt * 1000).toISOString(),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
  };
}

function deriveTitle(preview: string) {
  const normalized = preview.trim();
  if (!normalized) {
    return "New Session";
  }

  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized;
}

async function* mapAppServerNotificationsToRuntimeEvents(
  sessionId: string,
  turnId: string,
  notifications: AsyncIterable<AppServerNotification>,
): AsyncIterable<RuntimeEvent> {
  yield {
    type: "run.started",
    runId: turnId,
    sessionId,
    createdAt: new Date().toISOString(),
  };

  for await (const notification of notifications) {
    const createdAt = new Date().toISOString();

    if (
      notification.method === "item/agentMessage/delta" &&
      notification.params &&
      typeof notification.params.itemId === "string" &&
      typeof notification.params.delta === "string"
    ) {
      yield {
        type: "message.delta",
        runId: turnId,
        messageId: notification.params.itemId,
        delta: notification.params.delta,
        createdAt,
      };
      continue;
    }

    if (
      notification.method === "item/completed" &&
      notification.params &&
      notification.params.item &&
      typeof notification.params.item === "object" &&
      "type" in notification.params.item &&
      notification.params.item.type === "agentMessage" &&
      "id" in notification.params.item &&
      typeof notification.params.item.id === "string"
    ) {
      yield {
        type: "message.completed",
        runId: turnId,
        messageId: notification.params.item.id,
        createdAt,
      };
      continue;
    }

    if (
      notification.method === "turn/completed" &&
      notification.params &&
      notification.params.turn &&
      typeof notification.params.turn === "object" &&
      "status" in notification.params.turn
    ) {
      if (notification.params.turn.status === "completed") {
        yield {
          type: "run.completed",
          runId: turnId,
          sessionId,
          createdAt,
        };
      } else {
        yield {
          type: "run.failed",
          runId: turnId,
          sessionId,
          error:
            "error" in notification.params.turn &&
            notification.params.turn.error &&
            typeof notification.params.turn.error === "object" &&
            "message" in notification.params.turn.error &&
            typeof notification.params.turn.error.message === "string"
              ? notification.params.turn.error.message
              : "Codex turn failed",
          createdAt,
        };
      }
    }
  }
}
