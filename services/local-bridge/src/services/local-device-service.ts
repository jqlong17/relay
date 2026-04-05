import os from "node:os";

import type { RelayDevice } from "@relay/shared-types";

import type { StoredRelayDevice } from "./relay-state-store";
import { RelayStateStore } from "./relay-state-store";

class LocalDeviceService {
  constructor(private readonly relayStateStore: RelayStateStore) {}

  getDevice(now = new Date().toISOString()): RelayDevice {
    const existing = this.relayStateStore.getLocalDevice();

    if (existing) {
      return {
        ...existing,
        status: "online",
        lastSeenAt: now,
      };
    }

    const createdDevice = this.createDefaultDevice(now);
    this.relayStateStore.saveLocalDevice(createdDevice);

    return {
      ...createdDevice,
      status: "online",
      lastSeenAt: now,
    };
  }

  saveDevice(device: RelayDevice) {
    this.relayStateStore.saveLocalDevice({
      id: device.id,
      name: device.name,
      hostname: device.hostname,
      platform: device.platform,
      arch: device.arch,
      bindingStatus: device.bindingStatus,
      boundUserId: device.boundUserId,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    });
  }

  private createDefaultDevice(now: string): StoredRelayDevice {
    const hostname = os.hostname().trim() || "unknown";
    const name = process.env.RELAY_DEVICE_NAME?.trim() || hostname;

    return {
      id: crypto.randomUUID(),
      name,
      hostname,
      platform: os.platform(),
      arch: os.arch(),
      bindingStatus: "unbound",
      boundUserId: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export { LocalDeviceService };
