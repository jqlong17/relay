import { NextResponse } from "next/server";

import { readBrowserSession } from "@/lib/realtime/browser-session";
import { createAuthenticatedSupabaseServerClient } from "@/lib/auth/server-supabase-session";
import { toErrorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  const relaySession = await readBrowserSession(request);

  if (!relaySession || relaySession.method !== "github" || !relaySession.sub) {
    return NextResponse.json({ error: "GitHub sign-in is required." }, { status: 401 });
  }

  try {
    const { supabase } = await createAuthenticatedSupabaseServerClient(request);
    const [{ data: devicesData, error: devicesError }, { data: preferenceData, error: preferenceError }] = await Promise.all([
      supabase
        .from("devices")
        .select("id, user_id, local_device_id, name, hostname, platform, arch, status, last_seen_at, created_at, updated_at")
        .order("updated_at", { ascending: false }),
      supabase.from("user_device_preferences").select("default_device_id").maybeSingle(),
    ]);

    if (devicesError) {
      throw devicesError;
    }

    if (preferenceError) {
      throw preferenceError;
    }

    return NextResponse.json({
      userId: relaySession.sub,
      defaultDeviceId:
        typeof preferenceData?.default_device_id === "string" && preferenceData.default_device_id.trim().length > 0
          ? preferenceData.default_device_id.trim()
          : null,
      items: devicesData ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, "Failed to load devices.") }, { status: 400 });
  }
}
