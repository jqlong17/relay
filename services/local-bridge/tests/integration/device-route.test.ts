import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createBridgeServer } from "../../src";
import { DeviceBindingService } from "../../src/services/device-binding-service";
import { RelayStateStore } from "../../src/services/relay-state-store";

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

describe("GET /device", () => {
  it("returns a stable local device identity", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-device-route-"));
    tempDirs.push(tempDir);
    const relayStateStore = new RelayStateStore(path.join(tempDir, "state.json"));

    activeServer = createBridgeServer({
      relayStateStore,
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
    const firstResponse = await fetch(`http://127.0.0.1:${address.port}/device`);
    const firstData = (await firstResponse.json()) as {
      item: {
        id: string;
        bindingStatus: string;
        status: string;
      };
    };
    const secondResponse = await fetch(`http://127.0.0.1:${address.port}/device`);
    const secondData = (await secondResponse.json()) as {
      item: {
        id: string;
      };
    };

    expect(firstResponse.status).toBe(200);
    expect(firstData.item.id).toBeTruthy();
    expect(firstData.item.bindingStatus).toBe("unbound");
    expect(firstData.item.status).toBe("online");
    expect(secondData.item.id).toBe(firstData.item.id);
  });

  it("binds the current local device and persists the bound state", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-device-bind-route-"));
    tempDirs.push(tempDir);
    const relayStateStore = new RelayStateStore(path.join(tempDir, "state.json"));

    activeServer = createBridgeServer({
      relayStateStore,
      deviceBindingService: {
        bindDevice: async (_code, device) => ({
          ...device,
          bindingStatus: "bound",
          boundUserId: "user-1",
          updatedAt: "2026-04-05T00:20:00.000Z",
          lastSeenAt: "2026-04-05T00:20:00.000Z",
        }),
        isConfigured: () => true,
      } as unknown as DeviceBindingService,
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
    const bindResponse = await fetch(`http://127.0.0.1:${address.port}/device/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "BIND1234" }),
    });
    const bindData = (await bindResponse.json()) as {
      item: {
        bindingStatus: string;
        boundUserId: string | null;
      };
    };
    const deviceResponse = await fetch(`http://127.0.0.1:${address.port}/device`);
    const deviceData = (await deviceResponse.json()) as {
      item: {
        bindingStatus: string;
        boundUserId: string | null;
      };
    };

    expect(bindResponse.status).toBe(200);
    expect(bindData.item.bindingStatus).toBe("bound");
    expect(bindData.item.boundUserId).toBe("user-1");
    expect(deviceData.item.bindingStatus).toBe("bound");
    expect(deviceData.item.boundUserId).toBe("user-1");
  });
});
