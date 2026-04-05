type RelayBridgeHeaders = Record<string, string>;

type RelayAgentRequest =
  | {
      id: string;
      kind: "ping";
      sentAt: string;
    }
  | {
      body?: string;
      headers?: RelayBridgeHeaders;
      id: string;
      kind: "bridge-http";
      method: "DELETE" | "GET" | "PATCH" | "POST";
      path: string;
      sentAt: string;
    };

type RelayAgentEnvelope = {
  type: "agent.request";
  request: RelayAgentRequest;
};

type RelayAgentResponse =
  | {
      deviceId: string;
      hostname: string;
      kind: "ping";
      name: string;
      receivedAt: string;
      requestId: string;
      respondedAt: string;
      userId: string;
    }
  | {
      deviceId: string;
      headers?: RelayBridgeHeaders;
      kind: "bridge-http-start";
      requestId: string;
      respondedAt: string;
      status: number;
      userId: string;
    }
  | {
      chunkBase64: string;
      deviceId: string;
      kind: "bridge-http-chunk";
      requestId: string;
      respondedAt: string;
      userId: string;
    }
  | {
      deviceId: string;
      kind: "bridge-http-end";
      requestId: string;
      respondedAt: string;
      userId: string;
    }
  | {
      deviceId: string;
      error: string;
      kind: "bridge-http-error";
      requestId: string;
      respondedAt: string;
      status?: number;
      userId: string;
    };

type RelayDeviceConnectionStatus = {
  connected: boolean;
  connectedAt: string | null;
  deviceId: string;
  userId: string | null;
};

export type {
  RelayAgentEnvelope,
  RelayAgentRequest,
  RelayAgentResponse,
  RelayBridgeHeaders,
  RelayDeviceConnectionStatus,
};
