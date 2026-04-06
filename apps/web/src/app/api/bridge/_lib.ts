import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { RelayBridgeHeaders } from "@relay/shared-types";

import { readSessionToken } from "@/lib/auth/session";
import { isLocalOnlyBridgePath, resolveBridgeRouteStatus } from "@/lib/realtime/bridge-target";
import { requestRemoteBridge } from "@/lib/realtime/cloud-relay-store";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4242";

function getBridgeBaseUrl() {
  return process.env.RELAY_LOCAL_BRIDGE_URL ?? DEFAULT_BRIDGE_URL;
}

async function bridgeFetch(pathname: string, init?: RequestInit) {
  if (isLocalOnlyBridgePath(pathname)) {
    return directBridgeFetch(pathname, init);
  }

  const routeStatus = await resolveBridgeRouteStatus();

  if (routeStatus.kind === "local") {
    return directBridgeFetch(pathname, init);
  }

  if (routeStatus.kind === "unavailable") {
    throw new BridgeRouteUnavailableError(buildUnavailableRouteMessage(routeStatus.reason));
  }

  const cookieStore = await cookies();
  const relaySession = await readSessionToken(cookieStore.get("relay_session")?.value);

  if (!relaySession?.sub || relaySession.method !== "github") {
    throw new BridgeRouteUnavailableError("GitHub sign-in is required before proxying a remote Relay device.");
  }

  const method = (init?.method ?? "GET").toUpperCase() as "DELETE" | "GET" | "PATCH" | "POST";
  const headers = normalizeBridgeHeaders(init?.headers);
  const body = typeof init?.body === "string" ? init.body : undefined;

  return requestRemoteBridge({
    localDeviceId: routeStatus.defaultLocalDeviceId,
    userId: relaySession.sub,
    method,
    path: pathname,
    headers,
    body,
  });
}

async function proxyBridge(pathname: string, init?: RequestInit) {
  try {
    const response = await bridgeFetch(pathname, init);
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    if (error instanceof BridgeRouteUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Relay could not complete the bridge request right now.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

class BridgeRouteUnavailableError extends Error {}

function buildUnavailableRouteMessage(
  reason: "default_device_missing" | "default_device_offline" | "github_session_expired" | "no_default_device" | "unknown",
) {
  switch (reason) {
    case "no_default_device":
      return "No default Relay device is selected for this GitHub account yet.";
    case "default_device_missing":
      return "The selected default Relay device no longer exists in your device directory.";
    case "default_device_offline":
      return "Your default Relay device is currently offline.";
    case "github_session_expired":
      return "Your GitHub cloud session expired. Please sign in again.";
    default:
      return "Relay could not resolve a usable device route right now.";
  }
}

function normalizeBridgeHeaders(headers: RequestInit["headers"]): RelayBridgeHeaders {
  const normalized: RelayBridgeHeaders = {};

  if (!headers) {
    return normalized;
  }

  if (headers instanceof Headers) {
    for (const [name, value] of headers.entries()) {
      normalized[name] = value;
    }

    return normalized;
  }

  if (Array.isArray(headers)) {
    for (const [name, value] of headers) {
      normalized[name] = value;
    }

    return normalized;
  }

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[name] = value;
    }
  }

  return normalized;
}

async function directBridgeFetch(pathname: string, init?: RequestInit) {
  return fetch(`${getBridgeBaseUrl()}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export { bridgeFetch, directBridgeFetch, getBridgeBaseUrl, proxyBridge };
