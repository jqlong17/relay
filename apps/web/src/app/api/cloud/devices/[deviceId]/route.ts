import { NextResponse } from "next/server";

import { createAuthenticatedSupabaseServerClient } from "@/lib/auth/server-supabase-session";
import { readBrowserSession } from "@/lib/realtime/browser-session";
import { toErrorMessage } from "@/lib/errors";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const relaySession = await readBrowserSession(request);

  if (!relaySession || relaySession.method !== "github" || !relaySession.sub) {
    return NextResponse.json({ error: "GitHub sign-in is required." }, { status: 401 });
  }

  const { deviceId: rawDeviceId } = await context.params;
  const deviceId = rawDeviceId?.trim() ?? "";

  if (!deviceId) {
    return NextResponse.json({ error: "Device id is required." }, { status: 400 });
  }

  try {
    const { supabase } = await createAuthenticatedSupabaseServerClient(request);
    const { data: preferenceData, error: preferenceError } = await supabase
      .from("user_device_preferences")
      .select("default_device_id")
      .maybeSingle();

    if (preferenceError) {
      throw preferenceError;
    }

    if (preferenceData?.default_device_id?.trim() === deviceId) {
      return NextResponse.json({ error: "The default Relay device cannot be deleted." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("devices")
      .delete()
      .eq("id", deviceId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.id) {
      return NextResponse.json({ error: "Device not found." }, { status: 404 });
    }

    return NextResponse.json({
      deletedDeviceId: data.id,
    });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, "Failed to delete the device.") }, { status: 400 });
  }
}
