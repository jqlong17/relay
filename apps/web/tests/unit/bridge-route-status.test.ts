import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeTargetMocks = vi.hoisted(() => ({
  resolveBridgeRouteStatus: vi.fn(),
}));

vi.mock("@/lib/realtime/bridge-target", () => ({
  resolveBridgeRouteStatus: bridgeTargetMocks.resolveBridgeRouteStatus,
}));

import { GET as getRouteStatus } from "../../src/app/api/bridge/route-status/route";

describe("bridge route status api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved bridge route status", async () => {
    bridgeTargetMocks.resolveBridgeRouteStatus.mockResolvedValue({
      kind: "remote",
      reason: "remote_default_device_online",
      defaultLocalDeviceId: "device-1",
    });

    const response = await getRouteStatus();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: "remote",
      reason: "remote_default_device_online",
      defaultLocalDeviceId: "device-1",
    });
  });
});
