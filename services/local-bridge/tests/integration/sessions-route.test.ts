import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer } from "../../src";
import { CodexAppServerService, type AppServerThread } from "../../src/services/codex-app-server";

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

describe("sessions routes", () => {
  it("creates and fetches sessions for the active workspace", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadList({ cwd }) {
          return threads.filter((thread) => thread.cwd === cwd);
        },
        async threadStart({ cwd }) {
          const now = Math.floor(Date.now() / 1000);
          const thread: AppServerThread = {
            id: "thread-1",
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

    const createResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Initial task" }),
    });
    const createData = (await createResponse.json()) as { item: { id: string; title: string } };

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`);
    const listData = (await listResponse.json()) as {
      items: Array<{ id: string; title: string }>;
      activeWorkspaceId: string | null;
    };

    const detailResponse = await fetch(
      `http://127.0.0.1:${address.port}/sessions/${createData.item.id}`,
    );
    const detailData = (await detailResponse.json()) as { item: { id: string; title: string } };

    expect(createResponse.status).toBe(200);
    expect(createData.item.title).toBe("Initial task");
    expect(listData.items).toHaveLength(1);
    expect(detailData.item.id).toBe(createData.item.id);
    expect(listData.activeWorkspaceId).not.toBeNull();
  });

  it("lists sessions by creation time instead of update time", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-created-order-"));
    tempDirs.push(workspacePath);
    const threads: AppServerThread[] = [
      {
        id: "thread-older",
        preview: "Older thread",
        createdAt: 100,
        updatedAt: 400,
        cwd: workspacePath,
        name: "Older thread",
        turns: [],
      },
      {
        id: "thread-newer",
        preview: "Newer thread",
        createdAt: 200,
        updatedAt: 300,
        cwd: workspacePath,
        name: "Newer thread",
        turns: [],
      },
    ];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadList({ cwd }) {
          return threads.filter((thread) => thread.cwd === cwd);
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

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/sessions?fresh=1`);
    const listData = (await listResponse.json()) as {
      items: Array<{ id: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listData.items.map((item) => item.id)).toEqual(["thread-newer", "thread-older"]);
  });

  it("returns empty messages for a new thread before first user turn is materialized", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-empty-"));
    tempDirs.push(workspacePath);
    const now = Math.floor(Date.now() / 1000);
    const thread: AppServerThread = {
      id: "thread-empty-1",
      preview: "",
      createdAt: now,
      updatedAt: now,
      cwd: workspacePath,
      name: "Empty thread",
      turns: [],
    };

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadRead(threadId, includeTurns) {
          if (threadId !== thread.id) {
            throw new Error("thread not found");
          }

          if (includeTurns) {
            throw new Error("thread is not materialized yet; includeTurns is unavailable before first user message");
          }

          return thread;
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
    const detailResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/${thread.id}`);
    const detailData = (await detailResponse.json()) as { item: { id: string; messages: unknown[]; title: string } };

    expect(detailResponse.status).toBe(200);
    expect(detailData.item.id).toBe(thread.id);
    expect(detailData.item.title).toBe("Empty thread");
    expect(detailData.item.messages).toEqual([]);
  });

  it("archives a session through the native thread archive route", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-archive-"));
    tempDirs.push(workspacePath);
    const archivedThreadIds: string[] = [];

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadArchive(threadId) {
          archivedThreadIds.push(threadId);
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
    const archiveResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/thread-archive-1/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const archiveData = (await archiveResponse.json()) as { ok: boolean; archivedSessionId: string };

    expect(archiveResponse.status).toBe(200);
    expect(archiveData.ok).toBe(true);
    expect(archiveData.archivedSessionId).toBe("thread-archive-1");
    expect(archivedThreadIds).toEqual(["thread-archive-1"]);
  });

  it("renames a session through the native thread rename route", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-rename-"));
    tempDirs.push(workspacePath);
    const now = Math.floor(Date.now() / 1000);
    const thread: AppServerThread = {
      id: "thread-rename-1",
      preview: "",
      createdAt: now,
      updatedAt: now,
      cwd: workspacePath,
      name: "Before rename",
      turns: [],
    };

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadSetName(threadId, name) {
          if (threadId === thread.id) {
            thread.name = name;
          }
        },
        async threadRead(threadId) {
          if (threadId !== thread.id) {
            throw new Error("thread not found");
          }

          return thread;
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
    const renameResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/${thread.id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "After rename" }),
    });
    const renameData = (await renameResponse.json()) as { ok: boolean; item: { id: string; title: string } };

    expect(renameResponse.status).toBe(200);
    expect(renameData.ok).toBe(true);
    expect(renameData.item.id).toBe(thread.id);
    expect(renameData.item.title).toBe("After rename");
  });

  it("publishes thread events for rename and archive over runtime subscriptions", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-events-"));
    tempDirs.push(workspacePath);
    const now = Math.floor(Date.now() / 1000);
    const thread: AppServerThread = {
      id: "thread-events-1",
      preview: "",
      createdAt: now,
      updatedAt: now,
      cwd: workspacePath,
      name: "Before rename",
      turns: [],
    };

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadSetName(threadId, name) {
          if (threadId === thread.id) {
            thread.name = name;
          }
        },
        async threadArchive(threadId) {
          if (threadId !== thread.id) {
            throw new Error("thread not found");
          }
        },
        async threadRead(threadId) {
          if (threadId !== thread.id) {
            throw new Error("thread not found");
          }

          return thread;
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

    const renameSubscription = await openRuntimeSubscription(`http://127.0.0.1:${address.port}`, {
      sessionId: thread.id,
    });

    const renameResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/${thread.id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "After rename" }),
    });

    expect(renameResponse.status).toBe(200);

    const renameEvents = await renameSubscription.waitForEvents((events) => {
      const types = events.map((event) => event.type);
      return types.includes("thread.updated") && types.includes("thread.list.changed");
    });

    await renameSubscription.close();

    expect(renameEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["thread.updated", "thread.list.changed"]),
    );

    const archiveSubscription = await openRuntimeSubscription(`http://127.0.0.1:${address.port}`, {
      sessionId: thread.id,
    });

    const archiveResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/${thread.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    expect(archiveResponse.status).toBe(200);

    const archiveEvents = await archiveSubscription.waitForEvents((events) => {
      const types = events.map((event) => event.type);
      return types.includes("thread.deleted_or_missing") && types.includes("thread.list.changed");
    });

    await archiveSubscription.close();

    expect(archiveEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["thread.deleted_or_missing", "thread.list.changed"]),
    );
  });

  it("returns a broken session detail instead of failing when rollout is missing", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-broken-detail-"));
    tempDirs.push(workspacePath);

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadRead() {
          throw new Error("Failed to resume thread: no rollout found for thread id thread-broken-1");
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

    const detailResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/thread-broken-1`);
    const detailData = (await detailResponse.json()) as {
      item: {
        id: string;
        title: string;
        messages: unknown[];
        syncState?: string;
        brokenReason?: string;
      };
      syncState?: string;
      brokenReason?: string;
    };

    expect(detailResponse.status).toBe(200);
    expect(detailData.item.id).toBe("thread-broken-1");
    expect(detailData.item.title).toBe("Broken Session");
    expect(detailData.item.messages).toEqual([]);
    expect(detailData.item.syncState).toBe("broken");
    expect(detailData.item.brokenReason).toBe("rollout_missing");
    expect(detailData.syncState).toBe("broken");
    expect(detailData.brokenReason).toBe("rollout_missing");
  });

  it("keeps known broken threads visible in list responses with broken markers", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sessions-broken-list-"));
    tempDirs.push(workspacePath);
    const now = Math.floor(Date.now() / 1000);
    const thread: AppServerThread = {
      id: "thread-broken-2",
      preview: "Broken thread preview",
      createdAt: now,
      updatedAt: now,
      cwd: workspacePath,
      name: "Broken thread",
      turns: [],
    };

    activeServer = createBridgeServer({
      codexAppServerService: new CodexAppServerService({
        async threadList() {
          return [thread];
        },
        async threadRead() {
          throw new Error("no rollout found for thread id thread-broken-2");
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

    const detailResponse = await fetch(`http://127.0.0.1:${address.port}/sessions/${thread.id}`);
    expect(detailResponse.status).toBe(200);

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/sessions`);
    const listData = (await listResponse.json()) as {
      items: Array<{
        id: string;
        syncState?: string;
        brokenReason?: string;
      }>;
      broken?: Array<{ sessionId: string; reason: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listData.items).toHaveLength(1);
    expect(listData.items[0]?.id).toBe(thread.id);
    expect(listData.items[0]?.syncState).toBe("broken");
    expect(listData.items[0]?.brokenReason).toBe("rollout_missing");
    expect(listData.broken).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: thread.id,
          reason: "rollout_missing",
        }),
      ]),
    );
  });
});

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

async function openRuntimeSubscription(
  baseUrl: string,
  options?: { sessionId?: string; workspaceId?: string },
) {
  const searchParams = new URLSearchParams();
  if (options?.sessionId) {
    searchParams.set("sessionId", options.sessionId);
  }
  if (options?.workspaceId) {
    searchParams.set("workspaceId", options.workspaceId);
  }

  const query = searchParams.toString();
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/runtime/subscribe${query ? `?${query}` : ""}`, {
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
