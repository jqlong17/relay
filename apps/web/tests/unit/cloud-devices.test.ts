import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadDeviceDirectory, setDefaultDevice } from "@/lib/api/cloud-devices";

describe("cloud devices api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now").mockImplementation(() => new Date("2026-04-05T01:00:30.000Z").getTime());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the current user's device directory and default device", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: "user-1",
          defaultDeviceId: "cloud-device-1",
          items: [
        {
          id: "cloud-device-1",
          user_id: "user-1",
          local_device_id: "local-device-1",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "online",
          last_seen_at: "2026-04-05T01:00:00.000Z",
          created_at: "2026-04-05T00:00:00.000Z",
          updated_at: "2026-04-05T01:00:00.000Z",
        },
      ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(loadDeviceDirectory()).resolves.toEqual({
      userId: "user-1",
      defaultDeviceId: "cloud-device-1",
      items: [
        {
          id: "cloud-device-1",
          userId: "user-1",
          localDeviceId: "local-device-1",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "online",
          lastSeenAt: "2026-04-05T01:00:00.000Z",
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T01:00:00.000Z",
        },
      ],
    });
  });

  it("marks stale devices as offline when the last heartbeat expired", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: "user-1",
          defaultDeviceId: "cloud-device-1",
          items: [
        {
          id: "cloud-device-1",
          user_id: "user-1",
          local_device_id: "local-device-1",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "online",
          last_seen_at: "2026-04-05T00:57:00.000Z",
          created_at: "2026-04-05T00:00:00.000Z",
          updated_at: "2026-04-05T00:57:00.000Z",
        },
      ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(loadDeviceDirectory()).resolves.toMatchObject({
      items: [
        {
          id: "cloud-device-1",
          status: "offline",
        },
      ],
    });
  });

  it("updates the default device through the Relay server api", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ defaultDeviceId: "cloud-device-2" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(setDefaultDevice("cloud-device-2")).resolves.toBe("cloud-device-2");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cloud/default-device",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
