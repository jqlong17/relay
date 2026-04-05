import { describe, expect, it, vi } from "vitest";

import { CloudRelayRealtimeService } from "../../src/services/cloud-relay-realtime-service";
import { LocalDeviceService } from "../../src/services/local-device-service";

const textEncoder = new TextEncoder();

describe("CloudRelayRealtimeService", () => {
  it("consumes a cloud ping event and responds back through the cloud route", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/realtime/agent/connect")) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(textEncoder.encode(": connected\n\n"));
              controller.enqueue(
                textEncoder.encode(
                  `data: ${JSON.stringify({
                    type: "agent.request",
                    request: {
                      id: "request-1",
                      kind: "ping",
                      sentAt: "2026-04-05T12:00:00.000Z",
                    },
                  })}\n\n`,
                ),
              );
              controller.close();
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
            },
            status: 200,
          },
        );
      }

      if (url.endsWith("/api/realtime/agent/respond")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          "content-type": "application/json",
        });

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    const localDeviceService = {
      getDevice: vi.fn().mockReturnValue({
        id: "device-1",
        name: "Relay Mac",
        hostname: "relay.local",
        platform: "darwin",
        arch: "arm64",
        status: "online",
        bindingStatus: "bound",
        boundUserId: "user-1",
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        lastSeenAt: "2026-04-05T00:00:00.000Z",
      }),
    } as unknown as LocalDeviceService;

    const service = new CloudRelayRealtimeService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localDeviceService,
      publicBaseUrl: "https://relay.example.com",
      relaySessionSecret: "test-session-secret",
    });

    await expect(service.connectOnce()).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toMatchObject({
      deviceId: "device-1",
      hostname: "relay.local",
      kind: "ping",
      name: "Relay Mac",
      requestId: "request-1",
      userId: "user-1",
    });
  });

  it("skips the cloud connection when the local device is not bound", async () => {
    const fetchImpl = vi.fn();
    const localDeviceService = {
      getDevice: vi.fn().mockReturnValue({
        id: "device-1",
        name: "Relay Mac",
        hostname: "relay.local",
        platform: "darwin",
        arch: "arm64",
        status: "online",
        bindingStatus: "unbound",
        boundUserId: null,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        lastSeenAt: "2026-04-05T00:00:00.000Z",
      }),
    } as unknown as LocalDeviceService;

    const service = new CloudRelayRealtimeService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localDeviceService,
      publicBaseUrl: "https://relay.example.com",
      relaySessionSecret: "test-session-secret",
    });

    await expect(service.connectOnce()).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("proxies a bridge request to the local bridge and streams the response back to the cloud", async () => {
    const recordedResponses: unknown[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/realtime/agent/connect")) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(textEncoder.encode(": connected\n\n"));
              controller.enqueue(
                textEncoder.encode(
                  `data: ${JSON.stringify({
                    type: "agent.request",
                    request: {
                      id: "request-bridge-1",
                      kind: "bridge-http",
                      method: "GET",
                      path: "/sessions",
                      sentAt: "2026-04-05T12:00:00.000Z",
                    },
                  })}\n\n`,
                ),
              );
              controller.close();
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
            },
            status: 200,
          },
        );
      }

      if (url === "http://127.0.0.1:4242/sessions") {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(textEncoder.encode('{"items":['));
              controller.enqueue(textEncoder.encode('{"id":"session-1"}]}'));
              controller.close();
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      }

      if (url.endsWith("/api/realtime/agent/respond")) {
        recordedResponses.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    const localDeviceService = {
      getDevice: vi.fn().mockReturnValue({
        id: "device-1",
        name: "Relay Mac",
        hostname: "relay.local",
        platform: "darwin",
        arch: "arm64",
        status: "online",
        bindingStatus: "bound",
        boundUserId: "user-1",
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        lastSeenAt: "2026-04-05T00:00:00.000Z",
      }),
    } as unknown as LocalDeviceService;

    const service = new CloudRelayRealtimeService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localDeviceService,
      localRelayBaseUrl: "http://127.0.0.1:4242",
      publicBaseUrl: "https://relay.example.com",
      relaySessionSecret: "test-session-secret",
    });

    await expect(service.connectOnce()).resolves.toBe(true);
    expect(recordedResponses[0]).toMatchObject({
      kind: "bridge-http-start",
      requestId: "request-bridge-1",
      status: 200,
    });
    expect(recordedResponses[1]).toMatchObject({
      kind: "bridge-http-chunk",
      requestId: "request-bridge-1",
    });
    expect(recordedResponses[2]).toMatchObject({
      kind: "bridge-http-chunk",
      requestId: "request-bridge-1",
    });
    expect(recordedResponses[3]).toMatchObject({
      kind: "bridge-http-end",
      requestId: "request-bridge-1",
    });
  });
});
