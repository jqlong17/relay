import type { IncomingMessage, ServerResponse } from "node:http";

import type { RuntimeEvent } from "@relay/shared-types";

import { readJsonBody } from "./json-body";
import { CodexAppServerService, type AppServerNotification } from "../services/codex-app-server";
import { WorkspaceStore } from "../services/workspace-store";

async function handleRuntimeRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  codexAppServerService: CodexAppServerService,
) {
  const runtimeUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "POST" && runtimeUrl.pathname === "/runtime/run") {
    const body = await readJsonBody<{ sessionId: string; content: string }>(request);
    const thread = await codexAppServerService.threadRead(body.sessionId, false).catch(() => null);

    if (!thread) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    const turnStream = await codexAppServerService.startTurnStream(body.sessionId, body.content);
    const stream = mapAppServerNotificationsToRuntimeEvents(
      body.sessionId,
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
      response.end();
      return true;
    }

    const events = await collectRuntimeEvents(stream);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ sessionId: body.sessionId, events }));
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
