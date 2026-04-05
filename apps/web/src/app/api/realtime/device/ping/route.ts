import type { RelayAgentEnvelope } from "@relay/shared-types";

import { readBrowserSession } from "@/lib/realtime/browser-session";
import { getRelayHub } from "@/lib/realtime/relay-hub";

type PingRequestBody = {
  deviceId?: string;
};

export async function POST(request: Request) {
  const session = await readBrowserSession(request);

  if (!session || session.method !== "github" || !session.sub) {
    return Response.json({ error: "GitHub sign-in is required for Relay cloud ping." }, { status: 401 });
  }

  let body: PingRequestBody;

  try {
    body = (await request.json()) as PingRequestBody;
  } catch {
    return Response.json({ error: "Ping request payload is invalid." }, { status: 400 });
  }

  const deviceId = body.deviceId?.trim() ?? "";

  if (!deviceId) {
    return Response.json({ error: "deviceId is required." }, { status: 400 });
  }

  const connectionStatus = getRelayHub().getConnectionStatus(deviceId);

  if (!connectionStatus.connected || connectionStatus.userId !== session.sub) {
    return Response.json({ error: "The default Relay device is not connected to the cloud relay right now." }, { status: 409 });
  }

  const event: RelayAgentEnvelope = {
    type: "agent.request",
    request: {
      id: crypto.randomUUID(),
      kind: "ping",
      sentAt: new Date().toISOString(),
    },
  };

  try {
    const response = await getRelayHub().request(deviceId, event, 8_000);
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Relay device did not respond.";
    return Response.json({ error: message }, { status: 504 });
  }
}
