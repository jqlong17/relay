import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Message, RuntimeEvent, Session } from "@relay/shared-types";

import { readJsonBody } from "./json-body";
import {
  CodexAppServerService,
  type AppServerNotification,
  type AppServerUserInput,
} from "../services/codex-app-server";
import { RuntimeEventBus, type RuntimeBridgeEvent } from "../services/runtime-event-bus";
import { SessionStore } from "../services/session-store";
import { TimelineMemoryService } from "../services/timeline-memory-service";
import { WorkspaceStore } from "../services/workspace-store";

async function handleRuntimeRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  workspaceStore: WorkspaceStore,
  sessionStore: SessionStore,
  codexAppServerService: CodexAppServerService,
  timelineMemoryService: TimelineMemoryService,
  runtimeEventBus: RuntimeEventBus,
) {
  const runtimeUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && runtimeUrl.pathname === "/runtime/subscribe") {
    const sessionId = runtimeUrl.searchParams.get("sessionId")?.trim() || undefined;
    const workspaceId = runtimeUrl.searchParams.get("workspaceId")?.trim() || undefined;

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    response.write(": connected\n\n");

    const unsubscribe = runtimeEventBus.subscribe(
      (event) => {
        if (response.writableEnded) {
          return;
        }

        writeSseEvent(response, event);
      },
      { sessionId, workspaceId },
    );
    const heartbeat = setInterval(() => {
      if (response.writableEnded) {
        return;
      }

      response.write(": heartbeat\n\n");
    }, 15_000);

    let released = false;
    const release = () => {
      if (released) {
        return;
      }

      released = true;
      clearInterval(heartbeat);
      unsubscribe();

      if (!response.writableEnded) {
        response.end();
      }
    };

    request.once("close", release);
    response.once("close", release);
    return true;
  }

  if (request.method === "POST" && runtimeUrl.pathname === "/runtime/run") {
    const body = await readJsonBody<{
      sessionId: string;
      content: string;
      attachments?: Array<{ path: string }>;
    }>(request);
    const draftSession = sessionStore.get(body.sessionId);
    const draftWorkspace = draftSession ? workspaceStore.get(draftSession.workspaceId) : null;

    let sessionId = body.sessionId;
    let thread =
      draftSession && draftWorkspace
        ? await codexAppServerService.threadStart({ cwd: draftWorkspace.localPath })
        : await codexAppServerService.threadRead(body.sessionId, false).catch(() => null);

    if (!thread) {
      runtimeEventBus.publish({
        type: "thread.deleted_or_missing",
        sessionId: body.sessionId,
        createdAt: new Date().toISOString(),
      });
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Session not found" }));
      return true;
    }

    if (draftSession) {
      await codexAppServerService.threadSetName(thread.id, draftSession.title);
      persistMaterializedSessionSnapshots(workspaceStore, draftSession.workspaceId, thread);
      sessionStore.remove(draftSession.id);
      workspaceStore.setPreferredSessionId(draftSession.workspaceId, thread.id);
      sessionId = thread.id;
    }

    const turnStream = await codexAppServerService.startTurnStream(
      sessionId,
      buildTurnInput(body.content, body.attachments),
    );
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

      await writeRuntimeEventStream(response, stream, runtimeEventBus);
      const snapshotSync = await syncSessionSnapshot(codexAppServerService, workspaceStore, sessionId);
      publishThreadSyncEvents(runtimeEventBus, sessionId, snapshotSync.workspaceId, snapshotSync.ok);
      void timelineMemoryService.maybeGenerateForSession(sessionId);
      response.end();
      return true;
    }

    const events = await collectRuntimeEvents(stream, runtimeEventBus);
    const snapshotSync = await syncSessionSnapshot(codexAppServerService, workspaceStore, sessionId);
    publishThreadSyncEvents(runtimeEventBus, sessionId, snapshotSync.workspaceId, snapshotSync.ok);
    void timelineMemoryService.maybeGenerateForSession(sessionId);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ sessionId, events }));
    return true;
  }

  if (request.method === "POST" && runtimeUrl.pathname === "/runtime/attachments") {
    const body = await readJsonBody<{
      sessionId: string;
      filename?: string;
      mimeType?: string;
      data: string;
    }>(request);

    if (!body.sessionId || !body.data) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Missing attachment payload" }));
      return true;
    }

    const workspacePath = await resolveSessionWorkspacePath(
      body.sessionId,
      workspaceStore,
      sessionStore,
      codexAppServerService,
    );

    const attachment = writeAttachmentFile(workspacePath, body.filename, body.mimeType, body.data);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item: attachment }));
    return true;
  }

  return false;
}

async function collectRuntimeEvents(stream: AsyncIterable<RuntimeEvent>, runtimeEventBus: RuntimeEventBus) {
  const events: RuntimeEvent[] = [];

  for await (const event of stream) {
    events.push(event);
    runtimeEventBus.publish(event);
  }

  return events;
}

async function writeRuntimeEventStream(
  response: ServerResponse<IncomingMessage>,
  stream: AsyncIterable<RuntimeEvent>,
  runtimeEventBus: RuntimeEventBus,
) {
  const events: RuntimeEvent[] = [];

  for await (const event of stream) {
    events.push(event);
    runtimeEventBus.publish(event);
    response.write(`${JSON.stringify(event)}\n`);
  }

  return events;
}

export { handleRuntimeRoute };

function persistMaterializedSessionSnapshots(
  workspaceStore: WorkspaceStore,
  workspaceId: string,
  thread: {
    id: string;
    preview: string;
    name?: string | null;
    createdAt: number;
    updatedAt: number;
    cwd?: string;
    turns: Array<{
      status: "inProgress" | "completed" | "interrupted" | "failed";
      items: Array<
        | { type: "userMessage"; id: string; content: AppServerUserInput[] }
        | { type: "agentMessage"; id: string; text: string }
        | { type: "plan"; id: string; text: string }
        | { type: "reasoning"; id: string; summary?: string[]; content?: string[] }
        | { type: "commandExecution"; id: string; command: string; aggregatedOutput?: string | null }
        | { type: string; id: string }
      >;
    }>;
  },
) {
  const detail = mapThreadToSessionDetail(thread, workspaceId);
  const summary = mapThreadToSessionSummary(thread, workspaceId);
  const snapshot = workspaceStore.getSessionListSnapshot(workspaceId);
  const nextItems = [summary, ...(snapshot?.items ?? []).filter((item) => item.id !== summary.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  workspaceStore.saveSessionDetailSnapshot(detail);
  workspaceStore.saveSessionListSnapshot(workspaceId, nextItems);
}

async function syncSessionSnapshot(
  codexAppServerService: CodexAppServerService,
  workspaceStore: WorkspaceStore,
  sessionId: string,
) {
  try {
    const thread = await codexAppServerService.threadRead(sessionId, true);
    const workspaceId = workspaceStore.findByLocalPath(thread.cwd)?.id ?? null;

    if (!workspaceId) {
      return {
        ok: true as const,
        workspaceId: null,
      };
    }

    persistMaterializedSessionSnapshots(workspaceStore, workspaceId, thread);
    return {
      ok: true as const,
      workspaceId,
    };
  } catch {
    // Ignore snapshot sync failures after runs.
    return {
      ok: false as const,
      workspaceId: null,
    };
  }
}

function publishThreadSyncEvents(
  runtimeEventBus: RuntimeEventBus,
  sessionId: string,
  workspaceId: string | null,
  synced: boolean,
) {
  const createdAt = new Date().toISOString();

  if (!synced) {
    runtimeEventBus.publish({
      type: "thread.broken",
      sessionId,
      reason: "snapshot_sync_failed",
      createdAt,
    });
    return;
  }

  runtimeEventBus.publish({
    type: "thread.updated",
    sessionId,
    workspaceId,
    createdAt,
  });
  runtimeEventBus.publish({
    type: "thread.list.changed",
    sessionId,
    workspaceId,
    createdAt,
  });
}

function writeSseEvent(
  response: ServerResponse<IncomingMessage>,
  event: RuntimeBridgeEvent,
) {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function mapThreadToSessionDetail(
  thread: {
    id: string;
    preview: string;
    name?: string | null;
    createdAt: number;
    updatedAt: number;
    turns: Array<{
      status: "inProgress" | "completed" | "interrupted" | "failed";
      items: Array<
        | { type: "userMessage"; id: string; content: AppServerUserInput[] }
        | { type: "agentMessage"; id: string; text: string }
        | { type: "plan"; id: string; text: string }
        | { type: "reasoning"; id: string; summary?: string[]; content?: string[] }
        | { type: "commandExecution"; id: string; command: string; aggregatedOutput?: string | null }
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
        sessionId: thread.id,
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

  return {
    id: thread.id,
    workspaceId,
    title: thread.name?.trim() ? thread.name : deriveTitle(thread.preview),
    turnCount: messages.filter((message) => message.role === "user").length,
    messages,
    cwd: thread.cwd,
    createdAt: new Date(thread.createdAt * 1000).toISOString(),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
  };
}

function mapThreadToSessionSummary(
  thread: {
    id: string;
    preview: string;
    name?: string | null;
    createdAt: number;
    updatedAt: number;
    cwd?: string;
    turns: Array<{
      status: "inProgress" | "completed" | "interrupted" | "failed";
      items: Array<
        | { type: "userMessage"; id: string; content: AppServerUserInput[] }
        | { type: "agentMessage"; id: string; text: string }
        | { type: "plan"; id: string; text: string }
        | { type: "reasoning"; id: string; summary?: string[]; content?: string[] }
        | { type: "commandExecution"; id: string; command: string; aggregatedOutput?: string | null }
        | { type: string; id: string }
      >;
    }>;
  },
  workspaceId: string,
): Session {
  return {
    id: thread.id,
    workspaceId,
    title: thread.name?.trim() ? thread.name : deriveTitle(thread.preview),
    turnCount: thread.turns.filter((turn) => turn.items.some((item) => item.type === "userMessage")).length,
    messages: [],
    cwd: thread.cwd,
    createdAt: new Date(thread.createdAt * 1000).toISOString(),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
  };
}

function buildTurnInput(content: string, attachments?: Array<{ path: string }>) {
  const input: AppServerUserInput[] = [];
  const text = content.trim();

  if (text) {
    input.push({ type: "text", text });
  }

  for (const attachment of attachments ?? []) {
    if (!attachment.path) {
      continue;
    }

    input.push({ type: "localImage", path: attachment.path });
  }

  return input;
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

      return `[Image URL]`;
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

async function resolveSessionWorkspacePath(
  sessionId: string,
  workspaceStore: WorkspaceStore,
  sessionStore: SessionStore,
  codexAppServerService: CodexAppServerService,
) {
  const draftSession = sessionStore.get(sessionId);
  if (draftSession) {
    const draftWorkspace = workspaceStore.get(draftSession.workspaceId);
    if (!draftWorkspace) {
      throw new Error("Workspace not found for attachment");
    }

    return draftWorkspace.localPath;
  }

  const thread = await codexAppServerService.threadRead(sessionId, false).catch(() => null);
  if (!thread) {
    throw new Error("Session not found for attachment");
  }

  return thread.cwd;
}

function writeAttachmentFile(workspacePath: string, filename: string | undefined, mimeType: string | undefined, data: string) {
  const buffer = Buffer.from(data, "base64");
  const uploadsDir = path.join(os.tmpdir(), "relay-runtime-images", sanitizePathSegment(path.basename(workspacePath)));
  fs.mkdirSync(uploadsDir, { recursive: true });

  const extension = getAttachmentExtension(filename, mimeType);
  const safeBase = sanitizePathSegment(path.basename(filename ?? "pasted-image", path.extname(filename ?? "pasted-image")));
  const storedPath = path.join(
    uploadsDir,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}${extension}`,
  );
  fs.writeFileSync(storedPath, buffer);

  return {
    path: storedPath,
    name: path.basename(storedPath),
    mimeType: mimeType ?? inferMimeTypeFromExtension(extension),
  };
}

function getAttachmentExtension(filename: string | undefined, mimeType: string | undefined) {
  const filenameExtension = path.extname(filename ?? "").toLowerCase();
  if (filenameExtension) {
    return filenameExtension;
  }

  if (mimeType === "image/jpeg") {
    return ".jpg";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  if (mimeType === "image/gif") {
    return ".gif";
  }

  return ".png";
}

function inferMimeTypeFromExtension(extension: string) {
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "image/png";
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
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
      notification.method === "item/reasoning/summaryTextDelta" &&
      notification.params &&
      typeof notification.params.delta === "string"
    ) {
      yield {
        type: "process.delta",
        runId: turnId,
        phase: "thinking",
        delta: notification.params.delta,
        createdAt,
      };
      continue;
    }

    if (
      notification.method === "item/plan/delta" &&
      notification.params &&
      typeof notification.params.delta === "string"
    ) {
      yield {
        type: "process.delta",
        runId: turnId,
        phase: "plan",
        delta: notification.params.delta,
        createdAt,
      };
      continue;
    }

    if (
      notification.method === "item/commandExecution/outputDelta" &&
      notification.params &&
      typeof notification.params.delta === "string"
    ) {
      yield {
        type: "process.delta",
        runId: turnId,
        phase: "command",
        delta: notification.params.delta,
        createdAt,
      };
      continue;
    }

    if (
      notification.method === "item/started" &&
      notification.params &&
      notification.params.item &&
      typeof notification.params.item === "object" &&
      "type" in notification.params.item &&
      notification.params.item.type === "commandExecution" &&
      "command" in notification.params.item &&
      typeof notification.params.item.command === "string"
    ) {
      yield {
        type: "process.delta",
        runId: turnId,
        phase: "command",
        delta: `$ ${notification.params.item.command}\n`,
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
