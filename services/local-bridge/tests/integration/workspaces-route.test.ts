import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer } from "../../src";

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

describe("workspaces routes", () => {
  it("opens a local directory as the active workspace", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-workspace-"));
    tempDirs.push(workspacePath);
    activeServer = createBridgeServer();

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
    const openResponse = await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });
    const openData = (await openResponse.json()) as {
      item: { name: string; localPath: string; isActive: boolean };
    };

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/workspaces`);
    const listData = (await listResponse.json()) as {
      items: Array<{ localPath: string }>;
      active?: { localPath: string };
    };

    expect(openResponse.status).toBe(200);
    expect(openData.item.localPath).toBe(workspacePath);
    expect(openData.item.isActive).toBe(true);
    expect(listData.items).toHaveLength(1);
    expect(listData.active?.localPath).toBe(workspacePath);
  });

  it("opens a workspace via the native picker route", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-workspace-picker-"));
    tempDirs.push(workspacePath);
    activeServer = createBridgeServer({
      workspacePicker: async () => workspacePath,
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
    const openResponse = await fetch(`http://127.0.0.1:${address.port}/workspaces/open-picker`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const openData = (await openResponse.json()) as {
      item: { localPath: string; isActive: boolean } | null;
      canceled: boolean;
    };

    expect(openResponse.status).toBe(200);
    expect(openData.canceled).toBe(false);
    expect(openData.item?.localPath).toBe(workspacePath);
    expect(openData.item?.isActive).toBe(true);
  });

  it("returns canceled when the picker is dismissed", async () => {
    activeServer = createBridgeServer({
      workspacePicker: async () => null,
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
    const openResponse = await fetch(`http://127.0.0.1:${address.port}/workspaces/open-picker`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const openData = (await openResponse.json()) as {
      item: null;
      canceled: boolean;
    };

    expect(openResponse.status).toBe(200);
    expect(openData.canceled).toBe(true);
    expect(openData.item).toBeNull();
  });

  it("removes a workspace and promotes another workspace when the active one is removed", async () => {
    const firstWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-workspace-first-"));
    const secondWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-workspace-second-"));
    tempDirs.push(firstWorkspacePath, secondWorkspacePath);
    activeServer = createBridgeServer();

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
    const firstOpenResponse = await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: firstWorkspacePath }),
    });
    const firstOpenData = (await firstOpenResponse.json()) as {
      item: { id: string; localPath: string; isActive: boolean };
    };

    const secondOpenResponse = await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: secondWorkspacePath }),
    });
    const secondOpenData = (await secondOpenResponse.json()) as {
      item: { id: string; localPath: string; isActive: boolean };
    };

    const removeResponse = await fetch(
      `http://127.0.0.1:${address.port}/workspaces/${secondOpenData.item.id}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      },
    );
    const removeData = (await removeResponse.json()) as {
      ok: boolean;
      removedWorkspaceId: string;
      active: { localPath: string } | null;
    };

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/workspaces`);
    const listData = (await listResponse.json()) as {
      items: Array<{ localPath: string }>;
      active: { localPath: string } | null;
    };

    expect(removeResponse.status).toBe(200);
    expect(removeData.ok).toBe(true);
    expect(removeData.removedWorkspaceId).toBe(secondOpenData.item.id);
    expect(listData.items).toHaveLength(1);
    expect(listData.items[0]?.localPath).toBe(firstWorkspacePath);
    expect(listData.active?.localPath).toBe(firstWorkspacePath);
  });
});
