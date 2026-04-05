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

async function loadBridgeRouteStatus() {
  const response = await fetch("/api/bridge/route-status", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load bridge route status.");
  }

  return (await response.json()) as BridgeRouteStatus;
}

export { loadBridgeRouteStatus };
export type { BridgeRouteStatus };
