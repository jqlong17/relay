import type { RelayAgentResponse } from "@relay/shared-types";

import { readAgentAuthorization } from "@/lib/realtime/agent-auth";
import { getRelayHub } from "@/lib/realtime/relay-hub";

export async function POST(request: Request) {
  const agent = await readAgentAuthorization(request);

  if (!agent) {
    return Response.json({ error: "Relay agent authorization is invalid." }, { status: 401 });
  }

  let payload: RelayAgentResponse;

  try {
    payload = (await request.json()) as RelayAgentResponse;
  } catch {
    return Response.json({ error: "Relay agent response payload is invalid." }, { status: 400 });
  }

  if (payload.deviceId !== agent.deviceId || payload.userId !== agent.userId) {
    return Response.json({ error: "Relay agent identity does not match the response payload." }, { status: 403 });
  }

  const resolved = getRelayHub().resolve(payload);

  if (!resolved) {
    return Response.json({ error: "The pending realtime request could not be found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
