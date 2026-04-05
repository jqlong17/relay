import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  devicesOrder: vi.fn(),
  getUser: vi.fn(),
  preferenceMaybeSingle: vi.fn(),
  preferenceUpsert: vi.fn(),
  preferenceUpsertSingle: vi.fn(),
}));

vi.mock("@/lib/auth/supabase", () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      getUser: supabaseMocks.getUser,
    },
    from: (table: string) => {
      if (table === "devices") {
        return {
          select: () => ({
            order: supabaseMocks.devicesOrder,
          }),
        };
      }

      if (table === "user_device_preferences") {
        return {
          select: () => ({
            maybeSingle: supabaseMocks.preferenceMaybeSingle,
          }),
          upsert: (payload: unknown, options: unknown) => {
            supabaseMocks.preferenceUpsert(payload, options);
            return {
              select: () => ({
                single: supabaseMocks.preferenceUpsertSingle,
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  })),
}));

import { loadDeviceDirectory, setDefaultDevice } from "@/lib/api/cloud-devices";

describe("cloud devices api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
        },
      },
      error: null,
    });
  });

  it("loads the current user's device directory and default device", async () => {
    supabaseMocks.devicesOrder.mockResolvedValue({
      data: [
        {
          id: "cloud-device-1",
          user_id: "user-1",
          local_device_id: "local-device-1",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "online",
          last_seen_at: "2026-04-05T00:00:00.000Z",
          created_at: "2026-04-05T00:00:00.000Z",
          updated_at: "2026-04-05T01:00:00.000Z",
        },
      ],
      error: null,
    });
    supabaseMocks.preferenceMaybeSingle.mockResolvedValue({
      data: {
        default_device_id: "cloud-device-1",
      },
      error: null,
    });

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
          lastSeenAt: "2026-04-05T00:00:00.000Z",
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T01:00:00.000Z",
        },
      ],
    });
  });

  it("upserts the default device against the current GitHub user", async () => {
    supabaseMocks.preferenceUpsertSingle.mockResolvedValue({
      data: {
        default_device_id: "cloud-device-2",
      },
      error: null,
    });

    await expect(setDefaultDevice("cloud-device-2")).resolves.toBe("cloud-device-2");
    expect(supabaseMocks.preferenceUpsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        default_device_id: "cloud-device-2",
      },
      {
        onConflict: "user_id",
      },
    );
  });
});
