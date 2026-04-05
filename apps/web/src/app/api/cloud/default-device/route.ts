import { NextResponse } from "next/server";

import { readBrowserSession } from "@/lib/realtime/browser-session";
import { createAuthenticatedSupabaseServerClient } from "@/lib/auth/server-supabase-session";
import { toErrorMessage } from "@/lib/errors";

type DefaultDeviceRequestBody = {
  deviceId?: string;
};

export async function POST(request: Request) {
  const relaySession = await readBrowserSession(request);

  if (!relaySession || relaySession.method !== "github" || !relaySession.sub) {
    return NextResponse.json({ error: "GitHub sign-in is required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DefaultDeviceRequestBody;
  const deviceId = body.deviceId?.trim() ?? "";

  if (!deviceId) {
    return NextResponse.json({ error: "Default device id is required." }, { status: 400 });
  }

  try {
    const { supabase } = await createAuthenticatedSupabaseServerClient(request);
    const { data, error } = await supabase
      .from("user_device_preferences")
      .upsert(
        {
          user_id: relaySession.sub,
          default_device_id: deviceId,
        },
        {
          onConflict: "user_id",
        },
      )
      .select("default_device_id")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      defaultDeviceId: data?.default_device_id?.trim() ?? deviceId,
    });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, "Failed to update the default device.") }, { status: 400 });
  }
}
