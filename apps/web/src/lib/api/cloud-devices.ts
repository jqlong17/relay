"use client";

import type { RelayCloudDevice, RelayDeviceDirectory } from "@relay/shared-types";
import { toErrorMessage } from "@/lib/errors";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase";

type SupabaseDeviceRow = {
  id?: string;
  user_id?: string;
  local_device_id?: string;
  name?: string;
  hostname?: string;
  platform?: string;
  arch?: string;
  status?: "online" | "offline";
  last_seen_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type SupabaseUserDevicePreferenceRow = {
  default_device_id?: string | null;
};

const DEVICE_ONLINE_TTL_MS = 90_000;

async function getSupabaseBrowserUserId() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(toErrorMessage(error, "Failed to read the current GitHub session."));
  }

  const userId = user?.id?.trim() ?? "";

  if (!userId) {
    throw new Error("GitHub browser session expired. Please sign in with GitHub again.");
  }

  return {
    supabase,
    userId,
  };
}

function mapCloudDevice(row: SupabaseDeviceRow): RelayCloudDevice {
  const lastSeenAt = typeof row.last_seen_at === "string" && row.last_seen_at.trim().length > 0 ? row.last_seen_at : null;
  const isFresh =
    lastSeenAt !== null &&
    Number.isFinite(Date.parse(lastSeenAt)) &&
    Date.now() - Date.parse(lastSeenAt) <= DEVICE_ONLINE_TTL_MS;

  return {
    id: row.id?.trim() ?? "",
    userId: row.user_id?.trim() ?? "",
    localDeviceId: row.local_device_id?.trim() ?? "",
    name: row.name?.trim() || "Relay Device",
    hostname: row.hostname?.trim() || "unknown",
    platform: row.platform?.trim() || "unknown",
    arch: row.arch?.trim() || "unknown",
    status: row.status === "offline" || !isFresh ? "offline" : "online",
    lastSeenAt,
    createdAt: row.created_at?.trim() ?? "",
    updatedAt: row.updated_at?.trim() ?? "",
  };
}

async function loadDeviceDirectory(): Promise<RelayDeviceDirectory> {
  const { supabase, userId } = await getSupabaseBrowserUserId();
  const [{ data: devicesData, error: devicesError }, { data: preferenceData, error: preferenceError }] = await Promise.all([
    supabase
      .from("devices")
      .select("id, user_id, local_device_id, name, hostname, platform, arch, status, last_seen_at, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("user_device_preferences").select("default_device_id").maybeSingle(),
  ]);

  if (devicesError) {
    throw new Error(toErrorMessage(devicesError, "Failed to load devices."));
  }

  if (preferenceError) {
    throw new Error(toErrorMessage(preferenceError, "Failed to load the default device."));
  }

  return {
    userId,
    defaultDeviceId:
      typeof preferenceData?.default_device_id === "string" && preferenceData.default_device_id.trim().length > 0
        ? preferenceData.default_device_id.trim()
        : null,
    items: (devicesData ?? []).map(mapCloudDevice),
  };
}

async function setDefaultDevice(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    throw new Error("Default device id is required.");
  }

  const { supabase, userId } = await getSupabaseBrowserUserId();
  const { data, error } = await supabase
    .from("user_device_preferences")
    .upsert(
      {
        user_id: userId,
        default_device_id: normalizedDeviceId,
      },
      {
        onConflict: "user_id",
      },
    )
    .select("default_device_id")
    .single();

  if (error) {
    throw new Error(toErrorMessage(error, "Failed to update the default device."));
  }

  const resolvedDefaultDeviceId = data?.default_device_id?.trim() ?? normalizedDeviceId;

  return resolvedDefaultDeviceId;
}

export { DEVICE_ONLINE_TTL_MS, getSupabaseBrowserUserId, loadDeviceDirectory, setDefaultDevice };
