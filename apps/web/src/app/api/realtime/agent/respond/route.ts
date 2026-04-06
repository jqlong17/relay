import type { RelayAgentResponse } from "@relay/shared-types";

import { readAgentAuthorization } from "@/lib/realtime/agent-auth";
import { storeRelayAgentResponse } from "@/lib/realtime/cloud-relay-store";

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

  try {
    await storeRelayAgentResponse(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The relay agent response could not be stored." },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
