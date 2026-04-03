import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer } from "../../src";
import { CodexAppServerService, type AppServerNotification, type AppServerThread } from "../../src/services/codex-app-server";

let activeServer: ReturnType<typeof createBridgeServer> | undefined;
const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const current = tempDirs.pop();
    if (current) {
      fs.rmSync(current, { recursive: true, force: true });
    }
  }

  if (activeServer) {
    await new Promise<void>((resolve, reject) => {
      activeServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    activeServer = undefined;
  }
});

describe("runtime route", () => {
  it("starts a run for an existing session", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          expect(cwd).toBe(workspacePath);
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: "thread-runtime-1",
            preview: "",
            createdAt: now,
            updatedAt: now,
            cwd,
            name: null,
            turns: [],
          };
          threads.push(thread);
          return thread;
        },
        async threadSetName(threadId, name) {
          const thread = threads.find((item) => item.id === threadId);
          if (thread) {
            thread.name = name;
          }
        },
        async threadRead(threadId) {
          const thread = threads.find((item) => item.id === threadId);
          if (!thread) {
            throw new Error("thread not found");
          }
          return thread;
        },
        async startTurnStream(threadId) {
          async function* notifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "item/agentMessage/delta",
              params: {
                threadId,
                turnId: "turn-1",
                itemId: "message-1",
                delta: "Mocked codex response",
              },
            };
            yield {
              method: "item/completed",
              params: {
                threadId,
                turnId: "turn-1",
                item: { type: "agentMessage", id: "message-1", text: "Mocked codex response" },
              },
            };
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: "turn-1", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-1", notifications: notifications() };
        },
      }),
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });

    const createSessionResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Run task" }),
    });
    const sessionData = (await createSessionResponse.json()) as { item: { id: string } };

    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionData.item.id, content: "Explain this codebase" }),
    });
    const runData = (await runResponse.json()) as {
      sessionId: string;
      events: Array<{ type: string }>;
    };

    expect(runResponse.status).toBe(200);
    expect(runData.sessionId).toBe("thread-runtime-1");
    expect(runData.sessionId).not.toBe(sessionData.item.id);
    expect(runData.events[0]?.type).toBe("run.started");
    expect(runData.events[runData.events.length - 1]?.type).toBe("run.completed");
  });

  it("streams runtime events as ndjson", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-stream-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          expect(cwd).toBe(workspacePath);
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: "thread-runtime-2",
            preview: "",
            createdAt: now,
            updatedAt: now,
            cwd,
            name: null,
            turns: [],
          };
          threads.push(thread);
          return thread;
        },
        async threadSetName(threadId, name) {
          const thread = threads.find((item) => item.id === threadId);
          if (thread) {
            thread.name = name;
          }
        },
        async threadRead(threadId) {
          const thread = threads.find((item) => item.id === threadId);
          if (!thread) {
            throw new Error("thread not found");
          }
          return thread;
        },
        async startTurnStream(threadId) {
          async function* notifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "item/agentMessage/delta",
              params: {
                threadId,
                turnId: "turn-2",
                itemId: "message-2",
                delta: "hello",
              },
            };
            yield {
              method: "item/completed",
              params: {
                threadId,
                turnId: "turn-2",
                item: { type: "agentMessage", id: "message-2", text: "hello" },
              },
            };
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: "turn-2", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-2", notifications: notifications() };
        },
      }),
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });

    const createSessionResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Run stream task" }),
    });
    const sessionData = (await createSessionResponse.json()) as { item: { id: string } };

    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run?stream=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionData.item.id, content: "Explain this codebase" }),
    });

    const body = await runResponse.text();
    const events = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; delta?: string });

    expect(runResponse.status).toBe(200);
    expect(runResponse.headers.get("content-type")).toContain("application/x-ndjson");
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "message.completed",
      "run.completed",
    ]);
    expect(events[1]?.delta).toBe("hello");
  });

  it("replaces a draft session id with the materialized thread id on first run", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-draft-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: "thread-runtime-draft-1",
            preview: "",
            createdAt: now,
            updatedAt: now,
            cwd,
            name: null,
            turns: [],
          };
          threads.push(thread);
          return thread;
        },
        async threadSetName(threadId, name) {
          const thread = threads.find((item) => item.id === threadId);
          if (thread) {
            thread.name = name;
          }
        },
        async threadRead(threadId) {
          const thread = threads.find((item) => item.id === threadId);
          if (!thread) {
            throw new Error("thread not found");
          }
          return thread;
        },
        async startTurnStream(threadId) {
          async function* notifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: "turn-draft-1", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-draft-1", notifications: notifications() };
        },
      }),
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });

    const createSessionResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Draft task" }),
    });
    const sessionData = (await createSessionResponse.json()) as { item: { id: string } };

    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionData.item.id, content: "hello" }),
    });
    const runData = (await runResponse.json()) as {
      sessionId: string;
      events: Array<{ type: string; sessionId?: string }>;
    };

    expect(runResponse.status).toBe(200);
    expect(runData.sessionId).toBe("thread-runtime-draft-1");
    expect(runData.sessionId).not.toBe(sessionData.item.id);
    expect(runData.events[0]).toMatchObject({ type: "run.started", sessionId: "thread-runtime-draft-1" });
  });

  it("continues runtime for an existing thread even when no workspace is active", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-detached-"));
    tempDirs.push(workspacePath);
    const now = Math.floor(Date.now() / 1000);
    const thread: AppServerThread = {
      id: "thread-runtime-detached",
      preview: "Existing thread",
      createdAt: now,
      updatedAt: now,
      cwd: workspacePath,
      name: "Existing thread",
      turns: [],
    };

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadRead(threadId) {
          if (threadId !== thread.id) {
            throw new Error("thread not found");
          }

          return thread;
        },
        async startTurnStream(threadId) {
          async function* notifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "item/agentMessage/delta",
              params: {
                threadId,
                turnId: "turn-detached-1",
                itemId: "message-detached-1",
                delta: "ok",
              },
            };
            yield {
              method: "item/completed",
              params: {
                threadId,
                turnId: "turn-detached-1",
                item: { type: "agentMessage", id: "message-detached-1", text: "ok" },
              },
            };
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: "turn-detached-1", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-detached-1", notifications: notifications() };
        },
      }),
    });

    await new Promise<void>((resolve, reject) => {
      activeServer?.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    const address = activeServer.address() as AddressInfo;
    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: thread.id, content: "continue" }),
    });
    const runData = (await runResponse.json()) as {
      sessionId: string;
      events: Array<{ type: string }>;
    };

    expect(runResponse.status).toBe(200);
    expect(runData.sessionId).toBe(thread.id);
    expect(runData.events.map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "message.completed",
      "run.completed",
    ]);
  });
});
