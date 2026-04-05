import { readBrowserSession } from "@/lib/realtime/browser-session";
import { getRelayHub } from "@/lib/realtime/relay-hub";

export async function GET(request: Request) {
  const session = await readBrowserSession(request);

  if (!session || session.method !== "github" || !session.sub) {
    return Response.json({ error: "GitHub sign-in is required for Relay cloud device status." }, { status: 401 });
  }

  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId")?.trim() ?? "";

  if (!deviceId) {
    return Response.json({ error: "deviceId is required." }, { status: 400 });
  }

  const status = getRelayHub().getConnectionStatus(deviceId);

  if (status.userId && status.userId !== session.sub) {
    return Response.json({ error: "The requested Relay device is not available for this account." }, { status: 404 });
  }

  return Response.json(status);
}
