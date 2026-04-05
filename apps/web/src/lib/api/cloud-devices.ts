"use client";

import type { RelayCloudDevice, RelayDeviceDirectory } from "@relay/shared-types";
import { toErrorMessage } from "@/lib/errors";

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

type DeviceDirectoryApiResponse = {
  userId: string;
  defaultDeviceId: string | null;
  items: SupabaseDeviceRow[];
};

function isDeviceDirectoryApiResponse(value: unknown): value is DeviceDirectoryApiResponse {
  return !!value && typeof value === "object" && typeof (value as DeviceDirectoryApiResponse).userId === "string";
}

const DEVICE_ONLINE_TTL_MS = 90_000;

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
  const response = await fetch("/api/cloud/devices", {
    method: "GET",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as DeviceDirectoryApiResponse | { error?: string } | null;

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, "Failed to load devices."));
  }

  if (!isDeviceDirectoryApiResponse(payload)) {
    throw new Error("Device directory payload is invalid.");
  }

  return {
    userId: payload.userId.trim(),
    defaultDeviceId: typeof payload.defaultDeviceId === "string" && payload.defaultDeviceId.trim().length > 0 ? payload.defaultDeviceId.trim() : null,
    items: payload.items.map(mapCloudDevice),
  };
}

async function setDefaultDevice(deviceId: string) {
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    throw new Error("Default device id is required.");
  }

  const response = await fetch("/api/cloud/default-device", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      deviceId: normalizedDeviceId,
    }),
  });
  const payload = (await response.json().catch(() => null)) as { defaultDeviceId?: string; error?: string } | null;

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, "Failed to update the default device."));
  }

  const resolvedDefaultDeviceId = payload?.defaultDeviceId?.trim() ?? normalizedDeviceId;

  return resolvedDefaultDeviceId;
}

export { DEVICE_ONLINE_TTL_MS, loadDeviceDirectory, setDefaultDevice };
