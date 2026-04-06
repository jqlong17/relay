import { readBrowserSession } from "@/lib/realtime/browser-session";
import {
  enqueueRelayAgentRequest,
  getCloudRelayConnectionStatus,
  waitForPingResponse,
} from "@/lib/realtime/cloud-relay-store";

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

  const result = await getCloudRelayConnectionStatus(deviceId, session.sub);

  if (!result) {
    return Response.json({ error: "The requested Relay device is not available for this account." }, { status: 404 });
  }

  if (!result.status.connected) {
    return Response.json({ error: "The default Relay device is not connected to the cloud relay right now." }, { status: 409 });
  }

  try {
    const requestId = await enqueueRelayAgentRequest({
      kind: "ping",
      localDeviceId: result.device.local_device_id?.trim() ?? "",
      timeoutMs: 8_000,
      userId: session.sub,
    });
    const response = await waitForPingResponse(requestId, 8_000);

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Relay device did not respond.";
    return Response.json({ error: message }, { status: 504 });
  }
}
