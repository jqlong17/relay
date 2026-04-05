import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  bindLocalDevice: vi.fn(),
  getLocalDevice: vi.fn(),
}));
const cloudDeviceMocks = vi.hoisted(() => ({
  loadDeviceDirectory: vi.fn(),
  setDefaultDevice: vi.fn(),
}));
const bindCodeMocks = vi.hoisted(() => ({
  createDeviceBindCode: vi.fn(),
}));

vi.mock("@/lib/api/bridge", () => bridgeMocks);
vi.mock("@/lib/api/cloud-devices", () => cloudDeviceMocks);
vi.mock("@/lib/api/device-binding", () => bindCodeMocks);

import { ensureCurrentGitHubDeviceReady } from "@/lib/auth/device-bootstrap";

describe("device bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-binds the current local device and sets it as default when the account has no devices yet", async () => {
    bridgeMocks.getLocalDevice.mockResolvedValue({
      item: makeLocalDevice({
        id: "local-device-1",
        bindingStatus: "unbound",
        boundUserId: null,
      }),
    });
    cloudDeviceMocks.loadDeviceDirectory
      .mockResolvedValueOnce({
        userId: "user-1",
        defaultDeviceId: null,
        items: [],
      })
      .mockResolvedValueOnce({
        userId: "user-1",
        defaultDeviceId: null,
        items: [makeCloudDevice({ id: "cloud-device-1", localDeviceId: "local-device-1" })],
      });
    bindCodeMocks.createDeviceBindCode.mockResolvedValue({
      code: "ABCDEF1234",
      expiresAt: "2026-04-05T01:00:00.000Z",
    });
    bridgeMocks.bindLocalDevice.mockResolvedValue({
      item: makeLocalDevice({
        id: "local-device-1",
        bindingStatus: "bound",
        boundUserId: "user-1",
      }),
    });
    cloudDeviceMocks.setDefaultDevice.mockResolvedValue("cloud-device-1");

    await expect(ensureCurrentGitHubDeviceReady()).resolves.toMatchObject({
      didBind: true,
      didSetDefault: true,
      directory: {
        userId: "user-1",
        defaultDeviceId: "cloud-device-1",
      },
      localDevice: {
        id: "local-device-1",
        bindingStatus: "bound",
        boundUserId: "user-1",
      },
    });

    expect(bindCodeMocks.createDeviceBindCode).toHaveBeenCalledWith("local-device-1", "Relay Mac");
    expect(bridgeMocks.bindLocalDevice).toHaveBeenCalledWith("ABCDEF1234");
    expect(cloudDeviceMocks.setDefaultDevice).toHaveBeenCalledWith("cloud-device-1");
  });

  it("fills in a default device for an already bound current machine", async () => {
    bridgeMocks.getLocalDevice.mockResolvedValue({
      item: makeLocalDevice({
        id: "local-device-1",
        bindingStatus: "bound",
        boundUserId: "user-1",
      }),
    });
    cloudDeviceMocks.loadDeviceDirectory.mockResolvedValue({
      userId: "user-1",
      defaultDeviceId: null,
      items: [makeCloudDevice({ id: "cloud-device-1", localDeviceId: "local-device-1" })],
    });
    cloudDeviceMocks.setDefaultDevice.mockResolvedValue("cloud-device-1");

    await expect(ensureCurrentGitHubDeviceReady()).resolves.toMatchObject({
      didBind: false,
      didSetDefault: true,
      directory: {
        defaultDeviceId: "cloud-device-1",
      },
    });

    expect(bindCodeMocks.createDeviceBindCode).not.toHaveBeenCalled();
    expect(bridgeMocks.bindLocalDevice).not.toHaveBeenCalled();
  });

  it("blocks automatic binding when the current machine is already owned by another account", async () => {
    bridgeMocks.getLocalDevice.mockResolvedValue({
      item: makeLocalDevice({
        id: "local-device-1",
        bindingStatus: "bound",
        boundUserId: "user-2",
      }),
    });
    cloudDeviceMocks.loadDeviceDirectory.mockResolvedValue({
      userId: "user-1",
      defaultDeviceId: null,
      items: [],
    });

    await expect(ensureCurrentGitHubDeviceReady()).rejects.toThrow(
      "This Relay device is already bound to another GitHub account.",
    );
  });
});

function makeLocalDevice(overrides: Partial<{
  id: string;
  bindingStatus: "unbound" | "bound";
  boundUserId: string | null;
}> = {}) {
  return {
    id: overrides.id ?? "local-device-1",
    name: "Relay Mac",
    hostname: "relay.local",
    platform: "darwin",
    arch: "arm64",
    status: "online" as const,
    bindingStatus: overrides.bindingStatus ?? "unbound",
    boundUserId: overrides.boundUserId ?? null,
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    lastSeenAt: "2026-04-05T00:00:00.000Z",
  };
}

function makeCloudDevice(overrides: Partial<{
  id: string;
  localDeviceId: string;
}> = {}) {
  return {
    id: overrides.id ?? "cloud-device-1",
    userId: "user-1",
    localDeviceId: overrides.localDeviceId ?? "local-device-1",
    name: "Relay Mac",
    hostname: "relay.local",
    platform: "darwin",
    arch: "arm64",
    status: "online" as const,
    lastSeenAt: "2026-04-05T00:00:00.000Z",
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
  };
}
