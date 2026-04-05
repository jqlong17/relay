import { beforeEach, describe, expect, it, vi } from "vitest";

const relayHubMocks = vi.hoisted(() => ({
  requestBridge: vi.fn(),
}));
const bridgeTargetMocks = vi.hoisted(() => ({
  resolveBridgeRouteStatus: vi.fn(),
}));

vi.mock("@/lib/realtime/relay-hub", () => ({
  getRelayHub: () => ({
    requestBridge: relayHubMocks.requestBridge,
  }),
}));

vi.mock("@/lib/realtime/bridge-target", () => ({
  isLocalOnlyBridgePath: vi.fn(() => false),
  resolveBridgeRouteStatus: bridgeTargetMocks.resolveBridgeRouteStatus,
}));

import { proxyBridge } from "../../src/app/api/bridge/_lib";

describe("bridge proxy lib", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when no usable remote bridge route is available", async () => {
    bridgeTargetMocks.resolveBridgeRouteStatus.mockResolvedValue({
      kind: "unavailable",
      reason: "default_device_offline",
      defaultLocalDeviceId: "device-1",
    });

    const response = await proxyBridge("/sessions");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Your default Relay device is currently offline.",
    });
  });

  it("routes through the relay hub when the default remote device is online", async () => {
    bridgeTargetMocks.resolveBridgeRouteStatus.mockResolvedValue({
      kind: "remote",
      reason: "remote_default_device_online",
      defaultLocalDeviceId: "device-1",
    });
    relayHubMocks.requestBridge.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await proxyBridge("/sessions");

    expect(response.status).toBe(200);
    expect(relayHubMocks.requestBridge).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
