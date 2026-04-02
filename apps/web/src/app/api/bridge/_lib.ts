import { NextResponse } from "next/server";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4242";

function getBridgeBaseUrl() {
  return process.env.RELAY_LOCAL_BRIDGE_URL ?? DEFAULT_BRIDGE_URL;
}

async function bridgeFetch(pathname: string, init?: RequestInit) {
  const response = await fetch(`${getBridgeBaseUrl()}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  return response;
}

async function proxyBridge(pathname: string, init?: RequestInit) {
  try {
    const response = await bridgeFetch(pathname, init);
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Local bridge is offline. Start services/local-bridge on http://127.0.0.1:4242. ${error.message}`
        : "Local bridge is offline. Start services/local-bridge on http://127.0.0.1:4242.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export { bridgeFetch, getBridgeBaseUrl, proxyBridge };
