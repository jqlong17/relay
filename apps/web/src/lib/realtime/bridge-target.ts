import { cookies } from "next/headers";

import { readSessionToken } from "@/lib/auth/session";
import { createAuthenticatedSupabaseServerClientFromCookieHeader } from "@/lib/auth/server-supabase-session";
import { getRelayHub } from "@/lib/realtime/relay-hub";

type BridgeRouteStatus =
  | {
      kind: "local";
      reason: "github_not_signed_in" | "local_bridge_available" | "local_device_matches_default" | "no_default_device_using_local";
    }
  | {
      defaultLocalDeviceId: string;
      kind: "remote";
      reason: "remote_default_device_online";
    }
  | {
      defaultLocalDeviceId?: string | null;
      kind: "unavailable";
      reason: "default_device_missing" | "default_device_offline" | "github_session_expired" | "no_default_device" | "unknown";
    };

type SupabaseDeviceRow = {
  id?: string;
  local_device_id?: string;
};

const LOCAL_ONLY_BRIDGE_PREFIXES = ["/device", "/device/bind"];
const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4242";

function isLocalOnlyBridgePath(pathname: string) {
  if (pathname.startsWith("/workspaces?mode=picker")) {
    return true;
  }

  return LOCAL_ONLY_BRIDGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}?`) || pathname.startsWith(`${prefix}/`),
  );
}

async function resolveBridgeTarget() {
  return resolveBridgeRouteStatus();
}

async function resolveBridgeRouteStatus(): Promise<BridgeRouteStatus> {
  const cookieStore = await cookies();
  const relaySessionToken = cookieStore.get("relay_session")?.value;
  const relaySession = await readSessionToken(relaySessionToken);
  const localDeviceId = await readCurrentLocalDeviceId();

  if (!relaySession || relaySession.method !== "github" || !relaySession.sub) {
    return {
      kind: "local",
      reason: localDeviceId ? "local_bridge_available" : "github_not_signed_in",
    };
  }

  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  try {
    const { supabase } = await createAuthenticatedSupabaseServerClientFromCookieHeader(cookieHeader);
    const [{ data: preferenceData, error: preferenceError }, { data: devicesData, error: devicesError }] = await Promise.all([
      supabase.from("user_device_preferences").select("default_device_id").maybeSingle(),
      supabase.from("devices").select("id, local_device_id"),
    ]);

    if (preferenceError || devicesError) {
      return localDeviceId
        ? {
            kind: "local",
            reason: "local_bridge_available",
          }
        : {
            kind: "unavailable",
            reason: "unknown",
          };
    }

    const defaultDeviceId = typeof preferenceData?.default_device_id === "string" ? preferenceData.default_device_id.trim() : "";

    if (!defaultDeviceId) {
      return localDeviceId
        ? {
            kind: "local",
            reason: "no_default_device_using_local",
          }
        : {
            kind: "unavailable",
            reason: "no_default_device",
          };
    }

    const defaultDevice = (devicesData ?? []).find((item) => item.id?.trim() === defaultDeviceId) as SupabaseDeviceRow | undefined;
    const defaultLocalDeviceId = defaultDevice?.local_device_id?.trim() ?? "";

    if (!defaultLocalDeviceId) {
      return {
        kind: "unavailable",
        reason: "default_device_missing",
      };
    }

    if (localDeviceId && localDeviceId === defaultLocalDeviceId) {
      return {
        kind: "local",
        reason: "local_device_matches_default",
      };
    }

    const status = getRelayHub().getConnectionStatus(defaultLocalDeviceId);

    if (!status.connected || status.userId !== relaySession.sub) {
      return {
        kind: "unavailable",
        defaultLocalDeviceId,
        reason: "default_device_offline",
      };
    }

    return {
      kind: "remote",
      defaultLocalDeviceId,
      reason: "remote_default_device_online",
    };
  } catch {
    return localDeviceId
      ? {
          kind: "local",
          reason: "local_bridge_available",
        }
      : {
          kind: "unavailable",
          reason: "github_session_expired",
        };
  }
}

async function readCurrentLocalDeviceId() {
  try {
    const response = await fetch(`${process.env.RELAY_LOCAL_BRIDGE_URL ?? DEFAULT_BRIDGE_URL}/device`, {
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { item?: { id?: string } };
    return payload.item?.id?.trim() ?? null;
  } catch {
    return null;
  }
}

export { isLocalOnlyBridgePath, resolveBridgeRouteStatus, resolveBridgeTarget };
export type { BridgeRouteStatus };
