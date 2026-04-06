import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRelayAgentToken } from "@relay/shared-auth";

const browserSessionMocks = vi.hoisted(() => ({
  readBrowserSession: vi.fn(),
}));
const cloudRelayStoreMocks = vi.hoisted(() => ({
  claimRelayAgentRequest: vi.fn(),
  enqueueRelayAgentRequest: vi.fn(),
  getCloudRelayConnectionStatus: vi.fn(),
  storeRelayAgentResponse: vi.fn(),
  waitForPingResponse: vi.fn(),
}));

vi.mock("../../src/lib/realtime/browser-session", () => ({
  readBrowserSession: browserSessionMocks.readBrowserSession,
}));

vi.mock("../../src/lib/realtime/cloud-relay-store", () => ({
  claimRelayAgentRequest: cloudRelayStoreMocks.claimRelayAgentRequest,
  enqueueRelayAgentRequest: cloudRelayStoreMocks.enqueueRelayAgentRequest,
  getCloudRelayConnectionStatus: cloudRelayStoreMocks.getCloudRelayConnectionStatus,
  storeRelayAgentResponse: cloudRelayStoreMocks.storeRelayAgentResponse,
  waitForPingResponse: cloudRelayStoreMocks.waitForPingResponse,
}));

import { GET as connectAgent } from "../../src/app/api/realtime/agent/connect/route";
import { POST as respondAgent } from "../../src/app/api/realtime/agent/respond/route";
import { POST as pingDevice } from "../../src/app/api/realtime/device/ping/route";
import { GET as deviceStatus } from "../../src/app/api/realtime/device/status/route";

const textDecoder = new TextDecoder();

describe("realtime relay routes", () => {
  const originalSecret = process.env.RELAY_SESSION_SECRET;

  beforeEach(() => {
    process.env.RELAY_SESSION_SECRET = "test-session-secret";
    vi.clearAllMocks();
    browserSessionMocks.readBrowserSession.mockResolvedValue({
      method: "github",
      sub: "user-1",
    });
  });

  afterEach(() => {
    process.env.RELAY_SESSION_SECRET = originalSecret;
  });

  it("reports connected status and completes a ping round-trip", async () => {
    cloudRelayStoreMocks.getCloudRelayConnectionStatus.mockResolvedValue({
      device: {
        id: "cloud-device-1",
        local_device_id: "device-1",
      },
      status: {
        connected: true,
        connectedAt: "2026-04-05T12:00:01.000Z",
        deviceId: "cloud-device-1",
        userId: "user-1",
      },
    });
    cloudRelayStoreMocks.enqueueRelayAgentRequest.mockResolvedValue("request-1");
    cloudRelayStoreMocks.waitForPingResponse.mockResolvedValue({
      deviceId: "device-1",
      hostname: "relay.local",
      kind: "ping",
      name: "Relay Mac",
      receivedAt: "2026-04-05T12:00:01.000Z",
      requestId: "request-1",
      respondedAt: "2026-04-05T12:00:01.500Z",
      userId: "user-1",
    });

    const statusResponse = await deviceStatus(
      new Request("http://localhost/api/realtime/device/status?deviceId=cloud-device-1"),
    );

    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      connected: true,
      deviceId: "cloud-device-1",
      userId: "user-1",
    });
    expect(cloudRelayStoreMocks.getCloudRelayConnectionStatus).toHaveBeenCalledWith("cloud-device-1", "user-1");

    const pingResponse = await pingDevice(
      new Request("http://localhost/api/realtime/device/ping", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ deviceId: "cloud-device-1" }),
      }),
    );

    expect(pingResponse.status).toBe(200);
    await expect(pingResponse.json()).resolves.toMatchObject({
      deviceId: "device-1",
      hostname: "relay.local",
      kind: "ping",
      name: "Relay Mac",
      userId: "user-1",
    });
    expect(cloudRelayStoreMocks.enqueueRelayAgentRequest).toHaveBeenCalledWith({
      kind: "ping",
      localDeviceId: "device-1",
      timeoutMs: 8_000,
      userId: "user-1",
    });
    expect(cloudRelayStoreMocks.waitForPingResponse).toHaveBeenCalledWith("request-1", 8_000);
  });

  it("rejects ping when the device has no live cloud connection", async () => {
    cloudRelayStoreMocks.getCloudRelayConnectionStatus.mockResolvedValue({
      device: {
        id: "cloud-device-offline",
        local_device_id: "device-offline",
      },
      status: {
        connected: false,
        connectedAt: null,
        deviceId: "cloud-device-offline",
        userId: null,
      },
    });

    const response = await pingDevice(
      new Request("http://localhost/api/realtime/device/ping", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ deviceId: "cloud-device-offline" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "The default Relay device is not connected to the cloud relay right now.",
    });
    expect(cloudRelayStoreMocks.enqueueRelayAgentRequest).not.toHaveBeenCalled();
  });

  it("streams cloud relay requests to the agent and stores responses", async () => {
    const agentToken = await createRelayAgentToken("test-session-secret", {
      deviceId: "device-bridge",
      userId: "user-bridge",
    });
    const envelope = {
      type: "agent.request" as const,
      request: {
        id: "bridge-request-1",
        kind: "bridge-http" as const,
        method: "GET" as const,
        path: "/sessions",
        headers: {},
        sentAt: "2026-04-05T12:00:00.000Z",
      },
    };
    let delivered = false;

    cloudRelayStoreMocks.claimRelayAgentRequest.mockImplementation(async () => {
      if (delivered) {
        return null;
      }

      delivered = true;
      return envelope;
    });
    cloudRelayStoreMocks.storeRelayAgentResponse.mockResolvedValue(undefined);

    const connectResponse = await connectAgent(
      new Request("http://localhost/api/realtime/agent/connect", {
        headers: {
          authorization: `Bearer ${agentToken}`,
        },
      }),
    );

    expect(connectResponse.status).toBe(200);

    const streamReader = connectResponse.body?.getReader();
    expect(streamReader).toBeTruthy();

    const streamedEnvelope = await readNextEnvelope(streamReader!);
    expect(streamedEnvelope).toEqual(envelope);
    expect(cloudRelayStoreMocks.claimRelayAgentRequest).toHaveBeenCalledWith("user-bridge", "device-bridge");

    const response = await respondAgent(
      new Request("http://localhost/api/realtime/agent/respond", {
        method: "POST",
        headers: {
          authorization: `Bearer ${agentToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          deviceId: "device-bridge",
          headers: {
            "content-type": "application/json",
          },
          kind: "bridge-http-start",
          requestId: "bridge-request-1",
          respondedAt: "2026-04-05T12:00:01.000Z",
          status: 200,
          userId: "user-bridge",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(cloudRelayStoreMocks.storeRelayAgentResponse).toHaveBeenCalledWith({
      deviceId: "device-bridge",
      headers: {
        "content-type": "application/json",
      },
      kind: "bridge-http-start",
      requestId: "bridge-request-1",
      respondedAt: "2026-04-05T12:00:01.000Z",
      status: 200,
      userId: "user-bridge",
    });

    await streamReader?.cancel();
  });
});

async function readNextEnvelope(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      throw new Error("The agent stream ended before an envelope arrived.");
    }

    buffer += textDecoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const trimmed = chunk.trim();

      if (!trimmed || trimmed.startsWith(":")) {
        continue;
      }

      const dataLine = trimmed
        .split("\n")
        .find((line) => line.startsWith("data:"));

      if (!dataLine) {
        continue;
      }

      return JSON.parse(dataLine.slice("data:".length).trim()) as {
        request: {
          id: string;
        };
      };
    }
  }
}
