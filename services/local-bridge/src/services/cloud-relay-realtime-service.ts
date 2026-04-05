import { createRelayAgentToken } from "@relay/shared-auth";
import type { RelayAgentEnvelope, RelayAgentResponse } from "@relay/shared-types";

import { LocalDeviceService } from "./local-device-service";

type CloudRelayRealtimeServiceOptions = {
  fetchImpl?: typeof fetch;
  localDeviceService: LocalDeviceService;
  localRelayBaseUrl?: string | null;
  publicBaseUrl?: string | null;
  reconnectDelayMs?: number;
  relaySessionSecret?: string | null;
  sleepImpl?: (delayMs: number) => Promise<void>;
};

class CloudRelayRealtimeService {
  private readonly fetchImpl: typeof fetch;
  private readonly localDeviceService: LocalDeviceService;
  private readonly localRelayBaseUrl: string;
  private readonly publicBaseUrl: string | null;
  private readonly reconnectDelayMs: number;
  private readonly relaySessionSecret: string | null;
  private readonly sleepImpl: (delayMs: number) => Promise<void>;
  private abortController: AbortController | null = null;
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(options: CloudRelayRealtimeServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.localDeviceService = options.localDeviceService;
    this.localRelayBaseUrl = options.localRelayBaseUrl ?? process.env.RELAY_LOCAL_BRIDGE_URL?.trim() ?? "http://127.0.0.1:4242";
    this.publicBaseUrl = options.publicBaseUrl ?? process.env.RELAY_PUBLIC_BASE_URL?.trim() ?? null;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 3_000;
    this.relaySessionSecret = options.relaySessionSecret ?? process.env.RELAY_SESSION_SECRET?.trim() ?? null;
    this.sleepImpl = options.sleepImpl ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  isConfigured() {
    return Boolean(this.publicBaseUrl && this.relaySessionSecret);
  }

  start() {
    if (this.running || !this.isConfigured()) {
      return;
    }

    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async stop() {
    this.running = false;
    this.abortController?.abort();
    await this.loopPromise?.catch(() => {});
    this.loopPromise = null;
  }

  async connectOnce() {
    const device = this.localDeviceService.getDevice();

    if (device.bindingStatus !== "bound" || !device.boundUserId || !this.publicBaseUrl || !this.relaySessionSecret) {
      return false;
    }

    const token = await createRelayAgentToken(this.relaySessionSecret, {
      deviceId: device.id,
      userId: device.boundUserId,
      ttlMs: 60_000,
    });

    this.abortController = new AbortController();

    const response = await this.fetchImpl(new URL("/api/realtime/agent/connect", this.publicBaseUrl), {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${token}`,
      },
      signal: this.abortController.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Cloud relay connect failed with status ${response.status}.`);
    }

    await this.consumeEventStream(response.body, async (envelope) => {
      await this.handleEnvelope(envelope, device.id, device.boundUserId ?? "", device.name, device.hostname);
    });

    return true;
  }

  private async runLoop() {
    while (this.running) {
      try {
        const connected = await this.connectOnce();

        if (!this.running) {
          break;
        }

        if (!connected) {
          await this.sleepImpl(this.reconnectDelayMs);
        }
      } catch (error) {
        if (!this.running || isAbortError(error)) {
          break;
        }

        console.error("Cloud relay realtime connection failed", error);
        await this.sleepImpl(this.reconnectDelayMs);
      }
    }
  }

  private async consumeEventStream(body: ReadableStream<Uint8Array>, onEnvelope: (envelope: RelayAgentEnvelope) => Promise<void>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventData = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) {
          if (!eventData) {
            continue;
          }

          const payload = eventData.trim();
          eventData = "";

          if (!payload) {
            continue;
          }

          await onEnvelope(JSON.parse(payload) as RelayAgentEnvelope);
          continue;
        }

        if (line.startsWith(":")) {
          continue;
        }

        if (line.startsWith("data:")) {
          eventData += `${line.slice("data:".length).trimStart()}\n`;
        }
      }
    }
  }

  private async handleEnvelope(
    envelope: RelayAgentEnvelope,
    deviceId: string,
    userId: string,
    name: string,
    hostname: string,
  ) {
    if (envelope.type !== "agent.request" || !this.publicBaseUrl || !this.relaySessionSecret) {
      return;
    }

    if (envelope.request.kind === "ping") {
      const response: RelayAgentResponse = {
        deviceId,
        hostname,
        kind: "ping",
        name,
        receivedAt: new Date().toISOString(),
        requestId: envelope.request.id,
        respondedAt: new Date().toISOString(),
        userId,
      };

      await this.postAgentResponse(response, deviceId, userId);
      return;
    }

    if (envelope.request.kind === "bridge-http") {
      await this.handleBridgeHttpRequest(envelope.request, deviceId, userId);
    }
  }

  private async handleBridgeHttpRequest(
    request: Extract<RelayAgentEnvelope["request"], { kind: "bridge-http" }>,
    deviceId: string,
    userId: string,
  ) {
    try {
      const response = await this.fetchImpl(new URL(request.path, this.localRelayBaseUrl), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      await this.postAgentResponse(
        {
          deviceId,
          kind: "bridge-http-start",
          requestId: request.id,
          respondedAt: new Date().toISOString(),
          status: response.status,
          headers: {
            "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
            "cache-control": response.headers.get("cache-control") ?? "no-cache, no-transform",
          },
          userId,
        },
        deviceId,
        userId,
      );

      if (response.body) {
        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          await this.postAgentResponse(
            {
              chunkBase64: Buffer.from(value).toString("base64"),
              deviceId,
              kind: "bridge-http-chunk",
              requestId: request.id,
              respondedAt: new Date().toISOString(),
              userId,
            },
            deviceId,
            userId,
          );
        }
      }

      await this.postAgentResponse(
        {
          deviceId,
          kind: "bridge-http-end",
          requestId: request.id,
          respondedAt: new Date().toISOString(),
          userId,
        },
        deviceId,
        userId,
      );
    } catch (error) {
      await this.postAgentResponse(
        {
          deviceId,
          kind: "bridge-http-error",
          requestId: request.id,
          respondedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Remote bridge request failed.",
          userId,
        },
        deviceId,
        userId,
      );
    }
  }

  private async postAgentResponse(response: RelayAgentResponse, deviceId: string, userId: string) {
    if (!this.publicBaseUrl || !this.relaySessionSecret) {
      return;
    }

    const token = await createRelayAgentToken(this.relaySessionSecret, {
      deviceId,
      userId,
      ttlMs: 60_000,
    });

    const postResponse = await this.fetchImpl(new URL("/api/realtime/agent/respond", this.publicBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(response),
    });

    if (!postResponse.ok) {
      throw new Error(`Cloud relay response failed with status ${postResponse.status}.`);
    }
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export { CloudRelayRealtimeService };
