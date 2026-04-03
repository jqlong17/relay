import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer } from "../../src";
import { CodexAppServerService, type AppServerNotification, type AppServerThread } from "../../src/services/codex-app-server";
import { MemoryStore } from "../../src/services/memory-store";

let activeServer: ReturnType<typeof createBridgeServer> | undefined;
let activeMemoryStore: MemoryStore | undefined;
const tempDirs: string[] = [];

afterEach(async () => {
  activeMemoryStore?.close();
  activeMemoryStore = undefined;

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

  it("keeps a materialized session visible in the session list immediately after run", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-visible-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: "thread-runtime-visible",
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
        async threadList() {
          return threads;
        },
        async startTurnStream(threadId) {
          const thread = threads.find((item) => item.id === threadId);
          if (thread) {
            thread.preview = "Explain this codebase";
            thread.updatedAt = Math.floor(Date.now() / 1000);
            thread.turns = [
              {
                id: "turn-visible",
                status: "completed",
                items: [
                  { type: "userMessage", id: "user-visible", content: [{ type: "text", text: "Explain this codebase" }] },
                  { type: "agentMessage", id: "assistant-visible", text: "Mocked codex response" },
                ],
              },
            ];
          }

          async function* notifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "item/completed",
              params: {
                threadId,
                turnId: "turn-visible",
                item: { type: "agentMessage", id: "assistant-visible", text: "Mocked codex response" },
              },
            };
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: "turn-visible", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-visible", notifications: notifications() };
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

    expect(runResponse.status).toBe(200);

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`);
    const listData = (await listResponse.json()) as {
      items: Array<{ id: string; title: string }>;
    };

    expect(listData.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "thread-runtime-visible",
          title: "Run task",
        }),
      ]),
    );
    expect(listData.items.find((item) => item.id === sessionData.item.id)).toBeUndefined();
  });

  it("uploads pasted images and forwards them as localImage turn input", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-images-"));
    tempDirs.push(workspacePath);
    const inputs: unknown[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadRead(threadId) {
          return {
            id: threadId,
            preview: "",
            createdAt: Math.floor(Date.now() / 1000),
            updatedAt: Math.floor(Date.now() / 1000),
            cwd: workspacePath,
            name: "Image thread",
            turns: [],
          };
        },
        async startTurnStream(_threadId, input) {
          inputs.push(input);

          async function* notifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "turn/completed",
              params: {
                threadId: "session-1",
                turn: { id: "turn-image-1", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-image-1", notifications: notifications() };
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
    const uploadResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        filename: "pasted.png",
        mimeType: "image/png",
        data: Buffer.from("fake-image").toString("base64"),
      }),
    });
    const uploadData = (await uploadResponse.json()) as {
      item: { path: string; name: string; mimeType: string };
    };

    expect(uploadResponse.status).toBe(200);
    expect(uploadData.item.name).toContain("pasted");
    expect(uploadData.item.mimeType).toBe("image/png");
    expect(fs.existsSync(uploadData.item.path)).toBe(true);

    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        content: "Describe this image",
        attachments: [{ path: uploadData.item.path }],
      }),
    });

    expect(runResponse.status).toBe(200);
    expect(inputs).toEqual([
      [
        { type: "text", text: "Describe this image" },
        { type: "localImage", path: uploadData.item.path },
      ],
    ]);
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

  it("streams runtime events through a dedicated sse subscribe route", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-subscribe-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          expect(cwd).toBe(workspacePath);
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: "thread-runtime-subscribe-1",
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
                turnId: "turn-subscribe-1",
                itemId: "message-subscribe-1",
                delta: "SSE payload",
              },
            };
            yield {
              method: "item/completed",
              params: {
                threadId,
                turnId: "turn-subscribe-1",
                item: { type: "agentMessage", id: "message-subscribe-1", text: "SSE payload" },
              },
            };
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: "turn-subscribe-1", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-subscribe-1", notifications: notifications() };
        },
      }),
    });

    await listenServer(activeServer);

    const address = activeServer.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });

    const createSessionResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Run subscribe task" }),
    });
    const sessionData = (await createSessionResponse.json()) as { item: { id: string } };

    const subscription = await openRuntimeSubscription(`http://127.0.0.1:${address.port}`, {
      sessionId: "thread-runtime-subscribe-1",
    });

    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionData.item.id, content: "Explain this codebase" }),
    });
    expect(runResponse.status).toBe(200);

    const observedEvents = await subscription.waitForEvents((events) => {
      const eventTypes = events.map((event) => event.type);
      return (
        eventTypes.includes("run.completed") &&
        eventTypes.includes("thread.updated") &&
        eventTypes.includes("thread.list.changed")
      );
    });

    await subscription.close();

    expect(observedEvents.map((event) => event.type)).toContain("run.started");
    expect(observedEvents.map((event) => event.type)).toContain("message.delta");
    expect(observedEvents.map((event) => event.type)).toContain("message.completed");
    expect(observedEvents.map((event) => event.type)).toContain("run.completed");
    expect(observedEvents.map((event) => event.type)).toContain("thread.updated");
    expect(observedEvents.map((event) => event.type)).toContain("thread.list.changed");
  });

  it("emits run.failed over sse subscription when the turn fails", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-subscribe-failed-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          expect(cwd).toBe(workspacePath);
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: "thread-runtime-subscribe-failed-1",
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
                turn: { id: "turn-subscribe-failed-1", status: "failed", error: { message: "boom" } },
              },
            };
          }

          return { turnId: "turn-subscribe-failed-1", notifications: notifications() };
        },
      }),
    });

    await listenServer(activeServer);

    const address = activeServer.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });

    const createSessionResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Run failed task" }),
    });
    const sessionData = (await createSessionResponse.json()) as { item: { id: string } };

    const subscription = await openRuntimeSubscription(`http://127.0.0.1:${address.port}`, {
      sessionId: "thread-runtime-subscribe-failed-1",
    });

    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionData.item.id, content: "Explain this codebase" }),
    });
    expect(runResponse.status).toBe(200);

    const observedEvents = await subscription.waitForEvents((events) =>
      events.some((event) => event.type === "run.failed"),
    );

    await subscription.close();

    expect(observedEvents.map((event) => event.type)).toContain("run.started");
    expect(observedEvents.map((event) => event.type)).toContain("run.failed");
    expect(observedEvents.find((event) => event.type === "run.failed")).toMatchObject({
      error: "boom",
    });
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

  it("generates a timeline memory after reaching a 20-turn checkpoint", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-runtime-memory-"));
    tempDirs.push(workspacePath);
    const threads = new Map<string, AppServerThread>();
    const archivedThreadIds: string[] = [];
    const dbPath = path.join(workspacePath, "relay-memory.db");
    activeMemoryStore = new MemoryStore(dbPath);

    activeServer = createBridgeServer({
      memoryStore: activeMemoryStore,
      codexAppServerService: new CodexAppServerService({
        async threadStart({ cwd }) {
          const now = Math.floor(Date.now() / 1000);
          const nextId =
            threads.size === 0 ? "thread-runtime-memory-1" : `thread-memory-summary-${threads.size}`;
          const thread: AppServerThread = {
            id: nextId,
            preview: "",
            createdAt: now,
            updatedAt: now,
            cwd,
            name: null,
            turns: [],
          };
          threads.set(thread.id, thread);
          return thread;
        },
        async threadSetName(threadId, name) {
          const thread = threads.get(threadId);
          if (thread) {
            thread.name = name;
          }
        },
        async threadRead(threadId) {
          const thread = threads.get(threadId);
          if (!thread) {
            throw new Error("thread not found");
          }

          return thread;
        },
        async threadArchive(threadId) {
          archivedThreadIds.push(threadId);
        },
        async startTurnStream(threadId) {
          if (threadId === "thread-runtime-memory-1") {
            const thread = threads.get(threadId);
            if (thread) {
              thread.turns = buildThreadTurns(20);
            }

            async function* runtimeNotifications(): AsyncIterable<AppServerNotification> {
              yield {
                method: "turn/completed",
                params: {
                  threadId,
                  turn: { id: "turn-runtime-memory-1", status: "completed", error: null },
                },
              };
            }

            return { turnId: "turn-runtime-memory-1", notifications: runtimeNotifications() };
          }

          async function* memoryNotifications(): AsyncIterable<AppServerNotification> {
            yield {
              method: "item/agentMessage/delta",
              params: {
                threadId,
                turnId: "turn-memory-summary-1",
                itemId: "message-memory-summary-1",
                delta: "这是第20轮后的时间线记忆。",
              },
            };
            yield {
              method: "turn/completed",
              params: {
                threadId,
                turn: { id: "turn-memory-summary-1", status: "completed", error: null },
              },
            };
          }

          return { turnId: "turn-memory-summary-1", notifications: memoryNotifications() };
        },
      }),
    });

    await listenServer(activeServer);

    const address = activeServer.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });

    const createSessionResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "【记忆优化】" }),
    });
    const sessionData = (await createSessionResponse.json()) as { item: { id: string } };

    const runResponse = await fetch(`http://127.0.0.1:${address.port}/runtime/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionData.item.id, content: "继续优化记忆系统" }),
    });

    expect(runResponse.status).toBe(200);

    const stored = await waitForMemory(activeMemoryStore, "thread-runtime-memory-1", 20);

    expect(stored?.themeTitle).toBe("【记忆优化】");
    expect(stored?.themeKey).toBe("记忆优化");
    expect(stored?.content).toContain("第20轮");
    expect(archivedThreadIds).toEqual(["thread-memory-summary-1"]);
  });
});

function buildThreadTurns(userTurnCount: number) {
  return Array.from({ length: userTurnCount }, (_, index) => ({
    id: `turn-${index + 1}`,
    status: "completed" as const,
    error: null,
    items: [
      {
        type: "userMessage" as const,
        id: `user-${index + 1}`,
        content: [{ type: "text" as const, text: `用户消息 ${index + 1}` }],
      },
      {
        type: "agentMessage" as const,
        id: `assistant-${index + 1}`,
        text: `助手回复 ${index + 1}`,
      },
    ],
  }));
}

async function listenServer(server: ReturnType<typeof createBridgeServer>) {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function waitForMemory(store: MemoryStore, sessionId: string, checkpointTurnCount: number) {
  for (let index = 0; index < 20; index += 1) {
    const found = store.getByCheckpoint(sessionId, checkpointTurnCount);
    if (found) {
      return found;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return null;
}

async function openRuntimeSubscription(
  baseUrl: string,
  options?: { sessionId?: string },
) {
  const query = options?.sessionId ? `?sessionId=${encodeURIComponent(options.sessionId)}` : "";
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/runtime/subscribe${query}`, {
    method: "GET",
    headers: { accept: "text/event-stream" },
    signal: controller.signal,
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");

  if (!response.body) {
    throw new Error("runtime subscription response body is missing");
  }

  const events: Array<Record<string, unknown> & { type: string }> = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let active = true;

  const readerPromise = (async () => {
    while (active) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      textBuffer += decoder.decode(value, { stream: true });
      const chunks = textBuffer.split("\n\n");
      textBuffer = chunks.pop() ?? "";

      chunks.forEach((rawChunk) => {
        const dataLines = rawChunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());
        const rawData = dataLines.join("\n");

        if (!rawData) {
          return;
        }

        events.push(JSON.parse(rawData) as Record<string, unknown> & { type: string });
      });
    }
  })().catch((error: unknown) => {
    if (
      !(error instanceof DOMException && error.name === "AbortError") &&
      !(
        error instanceof TypeError &&
        typeof error.message === "string" &&
        error.message.includes("aborted")
      )
    ) {
      throw error;
    }
  });

  return {
    async waitForEvents(
      predicate: (events: Array<Record<string, unknown> & { type: string }>) => boolean,
      timeoutMs = 2_000,
    ) {
      const start = Date.now();

      while (Date.now() - start <= timeoutMs) {
        if (predicate(events)) {
          return [...events];
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      throw new Error(`timed out waiting for runtime events, received: ${JSON.stringify(events)}`);
    },
    async close() {
      active = false;
      controller.abort();
      await readerPromise;
    },
  };
}
