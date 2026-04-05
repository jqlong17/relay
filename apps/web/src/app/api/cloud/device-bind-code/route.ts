import { NextResponse } from "next/server";

import { readBrowserSession } from "@/lib/realtime/browser-session";
import { createAuthenticatedSupabaseServerClient } from "@/lib/auth/server-supabase-session";
import { toErrorMessage } from "@/lib/errors";

type DeviceBindCodeRequestBody = {
  deviceName?: string;
  localDeviceId?: string;
};

export async function POST(request: Request) {
  const relaySession = await readBrowserSession(request);

  if (!relaySession || relaySession.method !== "github" || !relaySession.sub) {
    return NextResponse.json({ error: "GitHub sign-in is required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DeviceBindCodeRequestBody;
  const localDeviceId = body.localDeviceId?.trim() ?? "";
  const deviceName = body.deviceName?.trim() ?? "";

  if (!localDeviceId || !deviceName) {
    return NextResponse.json({ error: "localDeviceId and deviceName are required." }, { status: 400 });
  }

  try {
    const { supabase } = await createAuthenticatedSupabaseServerClient(request);
    const { data, error } = await supabase.rpc("create_device_bind_code", {
      p_requested_device_name: deviceName,
      p_requested_local_device_id: localDeviceId,
    });

    if (error) {
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as { code?: string; expires_at?: string } | null;

    if (!row?.code || !row.expires_at) {
      throw new Error("Supabase did not return a bind code.");
    }

    return NextResponse.json({
      code: row.code,
      expiresAt: row.expires_at,
    });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, "Failed to create a device bind code.") }, { status: 400 });
  }
}
