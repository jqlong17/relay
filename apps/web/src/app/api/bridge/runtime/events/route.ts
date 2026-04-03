import { getBridgeBaseUrl } from "../../_lib";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const upstreamUrl = new URL("/runtime/subscribe", getBridgeBaseUrl());
  upstreamUrl.search = url.search;

  try {
    const response = await fetch(upstreamUrl, {
      cache: "no-store",
      headers: {
        accept: "text/event-stream",
      },
      method: "GET",
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "cache-control": "no-cache, no-transform",
        "content-type": response.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Local bridge is offline. Start services/local-bridge on http://127.0.0.1:4242. ${error.message}`
        : "Local bridge is offline. Start services/local-bridge on http://127.0.0.1:4242.";

    return Response.json({ error: message }, { status: 502 });
  }
}
