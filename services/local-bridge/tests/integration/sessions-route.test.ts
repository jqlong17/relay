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
});
