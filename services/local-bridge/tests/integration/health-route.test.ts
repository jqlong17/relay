import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer } from "../../src";

let activeServer: ReturnType<typeof createBridgeServer> | undefined;

afterEach(async () => {
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

describe("GET /health", () => {
  it("returns service status", async () => {
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
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const data = (await response.json()) as { status: string; service: string; version: string };

    expect(response.status).toBe(200);
    expect(data).toEqual({
      status: "ok",
      service: "local-bridge",
      version: "0.0.1",
    });
  });
});
