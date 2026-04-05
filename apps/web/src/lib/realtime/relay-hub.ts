import type { RelayAgentEnvelope, RelayAgentResponse, RelayBridgeHeaders, RelayDeviceConnectionStatus } from "@relay/shared-types";

type AgentConnection = {
  connectionId: string;
  connectedAt: string;
  deviceId: string;
  send: (event: RelayAgentEnvelope) => void;
  userId: string;
};

type PendingRequest = {
  controller?: ReadableStreamDefaultController<Uint8Array> | null;
  deviceId: string;
  kind: "bridge" | "ping";
  rejectStart?: (reason?: unknown) => void;
  reject: (reason?: unknown) => void;
  resolve: (value: RelayAgentResponse) => void;
  resolveStart?: (value: { headers: RelayBridgeHeaders; status: number }) => void;
  started?: boolean;
  timeout: NodeJS.Timeout;
};

class RelayHub {
  private readonly agents = new Map<string, AgentConnection>();
  private readonly pendingRequests = new Map<string, PendingRequest>();

  registerAgent(connection: AgentConnection) {
    this.agents.set(connection.deviceId, connection);
    return connection.connectionId;
  }

  unregisterAgent(deviceId: string, connectionId?: string) {
    const current = this.agents.get(deviceId);

    if (!current) {
      return;
    }

    if (connectionId && current.connectionId !== connectionId) {
      return;
    }

    this.agents.delete(deviceId);
  }

  getConnectionStatus(deviceId: string): RelayDeviceConnectionStatus {
    const agent = this.agents.get(deviceId);

    return {
      connected: !!agent,
      connectedAt: agent?.connectedAt ?? null,
      deviceId,
      userId: agent?.userId ?? null,
    };
  }

  async request(deviceId: string, event: RelayAgentEnvelope, timeoutMs = 10_000) {
    const agent = this.agents.get(deviceId);

    if (!agent) {
      throw new Error("The target Relay device is not connected to the cloud relay.");
    }

    return await new Promise<RelayAgentResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(event.request.id);
        reject(new Error("The Relay device did not respond in time."));
      }, timeoutMs);

      this.pendingRequests.set(event.request.id, {
        kind: "ping",
        deviceId,
        reject,
        resolve,
        timeout,
      });

      try {
        agent.send(event);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(event.request.id);
        reject(error);
      }
    });
  }

  async requestBridge(deviceId: string, event: RelayAgentEnvelope, timeoutMs = 10_000) {
    const agent = this.agents.get(deviceId);

    if (!agent) {
      throw new Error("The target Relay device is not connected to the cloud relay.");
    }

    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(nextController) {
        controller = nextController;
      },
      cancel: () => {
        this.pendingRequests.delete(event.request.id);
      },
    });

    const start = await new Promise<{ headers: RelayBridgeHeaders; status: number }>((resolveStart, rejectStart) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(event.request.id);
        rejectStart(new Error("The Relay device did not respond in time."));
      }, timeoutMs);

      this.pendingRequests.set(event.request.id, {
        kind: "bridge",
        controller,
        deviceId,
        reject: rejectStart,
        rejectStart,
        resolve: () => {},
        resolveStart,
        started: false,
        timeout,
      });

      const pending = this.pendingRequests.get(event.request.id);
      if (pending && controller) {
        pending.controller = controller;
      }

      try {
        agent.send(event);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(event.request.id);
        rejectStart(error);
      }
    });

    return new Response(stream, {
      status: start.status,
      headers: start.headers,
    });
  }

  resolve(response: RelayAgentResponse) {
    const pending = this.pendingRequests.get(response.requestId);

    if (!pending || pending.deviceId !== response.deviceId) {
      return false;
    }

    if (pending.kind === "ping") {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.requestId);
      pending.resolve(response);
      return true;
    }

    if (response.kind === "bridge-http-start") {
      clearTimeout(pending.timeout);
      pending.started = true;
      pending.resolveStart?.({
        headers: response.headers ?? { "content-type": "application/json; charset=utf-8" },
        status: response.status,
      });
      return true;
    }

    if (response.kind === "bridge-http-chunk") {
      pending.controller?.enqueue(Buffer.from(response.chunkBase64, "base64"));
      return true;
    }

    if (response.kind === "bridge-http-end") {
      pending.controller?.close();
      this.pendingRequests.delete(response.requestId);
      return true;
    }

    if (response.kind === "bridge-http-error") {
      const error = new Error(response.error);

      if (!pending.started) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.requestId);
        pending.rejectStart?.(error);
        return true;
      }

      pending.controller?.error(error);
      this.pendingRequests.delete(response.requestId);
      return true;
    }

    return false;
  }
}

const globalForRelayHub = globalThis as typeof globalThis & {
  __relayRealtimeHub?: RelayHub;
};

function getRelayHub() {
  if (!globalForRelayHub.__relayRealtimeHub) {
    globalForRelayHub.__relayRealtimeHub = new RelayHub();
  }

  return globalForRelayHub.__relayRealtimeHub;
}

export { getRelayHub };
