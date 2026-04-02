import { bridgeFetch } from "../../_lib";

export async function POST(request: Request) {
  const body = await request.text();
  const url = new URL(request.url);
  const isStreaming = url.searchParams.get("stream") === "1";

  try {
    const response = await bridgeFetch(isStreaming ? "/runtime/run?stream=1" : "/runtime/run", {
      method: "POST",
      body,
    });

    if (isStreaming) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/x-ndjson; charset=utf-8",
          "cache-control": "no-cache, no-transform",
        },
      });
    }

    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Local bridge is offline. Start services/local-bridge on http://127.0.0.1:4242. ${error.message}`
        : "Local bridge is offline. Start services/local-bridge on http://127.0.0.1:4242.";

    return Response.json({ error: message }, { status: 502 });
  }
}
