"use client";

import { toErrorMessage } from "@/lib/errors";
import { createSupabaseBrowserClient, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/auth/supabase";

type DeviceBindCode = {
  code: string;
  expiresAt: string;
};

type DeviceBindCodeRow = {
  code?: string;
  expires_at?: string;
};

async function createDeviceBindCode(localDeviceId: string, deviceName: string): Promise<DeviceBindCode> {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(toErrorMessage(sessionError, "Failed to read the current GitHub session."));
  }

  const accessToken = sessionData.session?.access_token?.trim() ?? "";

  if (!accessToken) {
    throw new Error("GitHub browser session expired. Please sign in with GitHub again.");
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth is not configured.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_device_bind_code`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_requested_device_name: deviceName,
      p_requested_local_device_id: localDeviceId,
    }),
  });

  const raw = await response.text();
  let payload: unknown = null;

  if (raw.length > 0) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, "Failed to create a device bind code."));
  }

  const row = (Array.isArray(payload) ? payload[0] : payload) as DeviceBindCodeRow | null;

  if (!row?.code || !row?.expires_at) {
    throw new Error("Supabase did not return a bind code.");
  }

  return {
    code: row.code,
    expiresAt: row.expires_at,
  };
}

export { createDeviceBindCode };
