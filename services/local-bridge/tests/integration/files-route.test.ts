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

describe("files route", () => {
  it("returns a file tree for the active workspace", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-files-"));
    tempDirs.push(workspacePath);
    fs.mkdirSync(path.join(workspacePath, "src"));
    fs.writeFileSync(path.join(workspacePath, "src", "index.ts"), "export {};\n", "utf8");

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
    await fetch(`http://127.0.0.1:${address.port}/workspaces/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: workspacePath }),
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/files/tree`);
    const data = (await response.json()) as {
      item: { name: string; kind: string; children?: Array<{ name: string }> };
    };

    expect(response.status).toBe(200);
    expect(data.item.kind).toBe("folder");
    expect(data.item.name).toBe(path.basename(workspacePath));
    expect(data.item.children?.some((child) => child.name === "src")).toBe(true);
  });

  it("opens a file or folder in finder through the bridge route", async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "relay-files-open-"));
    tempDirs.push(workspacePath);
    const filePath = path.join(workspacePath, "README.md");
    fs.writeFileSync(filePath, "# relay\n", "utf8");
    const opened: Array<{ targetPath: string; isDirectory: boolean }> = [];

    activeServer = createBridgeServer({
      finderOpener(targetPath, isDirectory) {
        opened.push({ targetPath, isDirectory });
      },
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

    const response = await fetch(`http://127.0.0.1:${address.port}/files/open-in-finder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
    const data = (await response.json()) as { ok: boolean; path: string };

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.path).toBe(filePath);
    expect(opened).toEqual([{ targetPath: filePath, isDirectory: false }]);
  });
});
