import { describe, expect, it, vi } from "vitest";

import { DeviceBindingService } from "../../src/services/device-binding-service";

describe("DeviceBindingService", () => {
  it("maps the Supabase RPC response into a bound local device", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          user_id: "user-1",
          name: "MacBook Pro",
          hostname: "relay-host",
          platform: "darwin",
          arch: "arm64",
          status: "online",
          created_at: "2026-04-05T00:00:00.000Z",
          updated_at: "2026-04-05T00:10:00.000Z",
        },
      ],
    });

    const service = new DeviceBindingService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      supabaseAnonKey: "anon-key",
      supabaseUrl: "https://example.supabase.co",
    });

    const boundDevice = await service.bindDevice("BIND1234", {
      id: "local-device-1",
      name: "Local Relay",
      hostname: "relay-host",
      platform: "darwin",
      arch: "arm64",
      status: "online",
      bindingStatus: "unbound",
      boundUserId: null,
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
      lastSeenAt: "2026-04-05T00:00:00.000Z",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(boundDevice.bindingStatus).toBe("bound");
    expect(boundDevice.boundUserId).toBe("user-1");
    expect(boundDevice.id).toBe("local-device-1");
  });
});
