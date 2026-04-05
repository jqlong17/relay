import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRelayAgentToken } from "@relay/shared-auth";
import { createSessionToken } from "../../src/lib/auth/session";
import { GET as connectAgent } from "../../src/app/api/realtime/agent/connect/route";
import { POST as respondAgent } from "../../src/app/api/realtime/agent/respond/route";
import { getRelayHub } from "../../src/lib/realtime/relay-hub";
import { POST as pingDevice } from "../../src/app/api/realtime/device/ping/route";
import { GET as deviceStatus } from "../../src/app/api/realtime/device/status/route";

const textDecoder = new TextDecoder();

describe("realtime relay routes", () => {
  const originalSecret = process.env.RELAY_SESSION_SECRET;

  beforeEach(() => {
    process.env.RELAY_SESSION_SECRET = "test-session-secret";
  });

  afterEach(() => {
    process.env.RELAY_SESSION_SECRET = originalSecret;
  });

  it("reports connected status and completes a ping round-trip", async () => {
    const sessionToken = await createSessionToken(Date.now(), {
      method: "github",
      provider: "github",
      userId: "user-1",
    });
    const agentToken = await createRelayAgentToken("test-session-secret", {
      deviceId: "device-1",
      userId: "user-1",
    });
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

    const responder = (async () => {
      const envelope = await readNextEnvelope(streamReader!);
      const response = await respondAgent(
        new Request("http://localhost/api/realtime/agent/respond", {
          method: "POST",
          headers: {
            authorization: `Bearer ${agentToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            deviceId: "device-1",
            hostname: "relay.local",
            kind: "ping",
            name: "Relay Mac",
            receivedAt: "2026-04-05T12:00:01.000Z",
            requestId: envelope.request.id,
            respondedAt: "2026-04-05T12:00:01.500Z",
            userId: "user-1",
          }),
        }),
      );

      expect(response.status).toBe(200);
    })();

    const statusResponse = await deviceStatus(
      new Request("http://localhost/api/realtime/device/status?deviceId=device-1", {
        headers: {
          cookie: `relay_session=${sessionToken}`,
        },
      }),
    );

    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      connected: true,
      deviceId: "device-1",
      userId: "user-1",
    });

    const pingResponse = await pingDevice(
      new Request("http://localhost/api/realtime/device/ping", {
        method: "POST",
        headers: {
          cookie: `relay_session=${sessionToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ deviceId: "device-1" }),
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

    await responder;
    await streamReader?.cancel();
  });

  it("rejects ping when the device has no live cloud connection", async () => {
    const sessionToken = await createSessionToken(Date.now(), {
      method: "github",
      provider: "github",
      userId: "user-1",
    });

    const response = await pingDevice(
      new Request("http://localhost/api/realtime/device/ping", {
        method: "POST",
        headers: {
          cookie: `relay_session=${sessionToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ deviceId: "offline-device" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "The default Relay device is not connected to the cloud relay right now.",
    });
  });

  it("streams remote bridge chunks back through the relay hub", async () => {
    const agentToken = await createRelayAgentToken("test-session-secret", {
      deviceId: "device-bridge",
      userId: "user-bridge",
    });
    const connectResponse = await connectAgent(
      new Request("http://localhost/api/realtime/agent/connect", {
        headers: {
          authorization: `Bearer ${agentToken}`,
        },
      }),
    );
    const streamReader = connectResponse.body?.getReader();
    expect(streamReader).toBeTruthy();

    const responsePromise = getRelayHub().requestBridge(
      "device-bridge",
      {
        type: "agent.request",
        request: {
          id: "bridge-request-1",
          kind: "bridge-http",
          method: "GET",
          path: "/sessions",
          sentAt: "2026-04-05T12:00:00.000Z",
        },
      },
      5_000,
    );

    const envelope = await readNextEnvelope(streamReader!);
    expect(envelope.request).toMatchObject({
      id: "bridge-request-1",
      kind: "bridge-http",
      method: "GET",
      path: "/sessions",
    });

    await respondAgent(
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
    await respondAgent(
      new Request("http://localhost/api/realtime/agent/respond", {
        method: "POST",
        headers: {
          authorization: `Bearer ${agentToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chunkBase64: Buffer.from('{"ok":true}\n').toString("base64"),
          deviceId: "device-bridge",
          kind: "bridge-http-chunk",
          requestId: "bridge-request-1",
          respondedAt: "2026-04-05T12:00:01.100Z",
          userId: "user-bridge",
        }),
      }),
    );
    await respondAgent(
      new Request("http://localhost/api/realtime/agent/respond", {
        method: "POST",
        headers: {
          authorization: `Bearer ${agentToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          deviceId: "device-bridge",
          kind: "bridge-http-end",
          requestId: "bridge-request-1",
          respondedAt: "2026-04-05T12:00:01.200Z",
          userId: "user-bridge",
        }),
      }),
    );

    const response = await responsePromise;
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('{"ok":true}\n');
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
