import { describe, expect, it, vi } from "vitest";

import { buildConnectionStatus, isFreshTimestamp } from "@/lib/realtime/cloud-relay-store";

describe("cloud relay store", () => {
  it("treats recent device heartbeats as connected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T02:30:00.000Z"));

    expect(isFreshTimestamp("2026-04-06T02:29:10.000Z")).toBe(true);

    vi.useRealTimers();
  });

  it("treats stale or offline devices as disconnected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T02:30:00.000Z"));

    expect(isFreshTimestamp("2026-04-06T02:28:00.000Z")).toBe(false);
    expect(
      buildConnectionStatus({
        id: "cloud-device-1",
        user_id: "user-1",
        local_device_id: "local-device-1",
        status: "offline",
        last_seen_at: "2026-04-06T02:29:40.000Z",
      }),
    ).toEqual({
      connected: false,
      connectedAt: null,
      deviceId: "cloud-device-1",
      userId: null,
    });

    vi.useRealTimers();
  });
});
