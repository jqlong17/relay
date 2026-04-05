import { describe, expect, it, vi } from "vitest";

import { DevicePresenceService } from "../../src/services/device-presence-service";
import { LocalDeviceService } from "../../src/services/local-device-service";

describe("DevicePresenceService", () => {
  it("publishes a heartbeat for a bound Relay device", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          user_id: "user-1",
          local_device_id: "local-device-1",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "online",
          last_seen_at: "2026-04-05T12:00:00.000Z",
          created_at: "2026-04-05T00:00:00.000Z",
          updated_at: "2026-04-05T12:00:00.000Z",
        },
      ],
    });
    const localDeviceService = {
      getDevice: vi.fn().mockReturnValue({
        id: "local-device-1",
        name: "Relay Mac",
        hostname: "relay.local",
        platform: "darwin",
        arch: "arm64",
        status: "online",
        bindingStatus: "bound",
        boundUserId: "user-1",
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        lastSeenAt: "2026-04-05T00:00:00.000Z",
      }),
    } as unknown as LocalDeviceService;

    const service = new DevicePresenceService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localDeviceService,
      supabaseAnonKey: "anon-key",
      supabaseUrl: "https://example.supabase.co",
    });

    const device = await service.syncPresence();

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/upsert_device_presence",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(device?.boundUserId).toBe("user-1");
    expect(device?.status).toBe("online");
  });

  it("skips heartbeats for unbound devices", async () => {
    const fetchImpl = vi.fn();
    const localDeviceService = {
      getDevice: vi.fn().mockReturnValue({
        id: "local-device-1",
        name: "Relay Mac",
        hostname: "relay.local",
        platform: "darwin",
        arch: "arm64",
        status: "online",
        bindingStatus: "unbound",
        boundUserId: null,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        lastSeenAt: "2026-04-05T00:00:00.000Z",
      }),
    } as unknown as LocalDeviceService;

    const service = new DevicePresenceService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localDeviceService,
      supabaseAnonKey: "anon-key",
      supabaseUrl: "https://example.supabase.co",
    });

    await expect(service.syncPresence()).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
