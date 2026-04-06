import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloudRelayStoreMocks = vi.hoisted(() => ({
  requestRemoteBridge: vi.fn(),
}));
const bridgeTargetMocks = vi.hoisted(() => ({
  resolveBridgeRouteStatus: vi.fn(),
}));
const sessionMocks = vi.hoisted(() => ({
  readSessionToken: vi.fn(),
}));
const cookieMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/realtime/cloud-relay-store", () => ({
  requestRemoteBridge: cloudRelayStoreMocks.requestRemoteBridge,
}));

vi.mock("@/lib/realtime/bridge-target", () => ({
  isLocalOnlyBridgePath: vi.fn(() => false),
  resolveBridgeRouteStatus: bridgeTargetMocks.resolveBridgeRouteStatus,
}));

vi.mock("next/headers", () => ({
  cookies: cookieMocks.cookies,
}));

vi.mock("@/lib/auth/session", () => ({
  readSessionToken: sessionMocks.readSessionToken,
}));

import { proxyBridge } from "../../src/app/api/bridge/_lib";

describe("bridge proxy lib", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieMocks.cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "relay-session-token" }),
    });
    sessionMocks.readSessionToken.mockResolvedValue({
      method: "github",
      sub: "user-1",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the local bridge when the current machine already took over", async () => {
    bridgeTargetMocks.resolveBridgeRouteStatus.mockResolvedValue({
      kind: "local",
      reason: "default_device_offline_using_local",
      defaultLocalDeviceId: "device-1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, source: "local" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    );

    const response = await proxyBridge("/sessions");

    expect(response.status).toBe(200);
    expect(cloudRelayStoreMocks.requestRemoteBridge).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ ok: true, source: "local" });
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
    cloudRelayStoreMocks.requestRemoteBridge.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await proxyBridge("/sessions");

    expect(response.status).toBe(200);
    expect(cloudRelayStoreMocks.requestRemoteBridge).toHaveBeenCalledOnce();
    expect(cloudRelayStoreMocks.requestRemoteBridge).toHaveBeenCalledWith({
      body: undefined,
      headers: {},
      localDeviceId: "device-1",
      method: "GET",
      path: "/sessions",
      userId: "user-1",
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
