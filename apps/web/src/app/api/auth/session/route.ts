import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionActor, getSessionCookieName, isSessionConfigured, readSessionToken } from "@/lib/auth/session";
import { isAccessPasswordConfigured } from "@/lib/auth/password";
import { isSupabaseAuthConfigured } from "@/lib/auth/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const sessionPayload = await readSessionToken(token);
  const authenticated = sessionPayload !== null;

  return NextResponse.json({
    authenticated,
    configured: (isAccessPasswordConfigured() && isSessionConfigured()) || (isSupabaseAuthConfigured() && isSessionConfigured()),
    session: getSessionActor(sessionPayload),
  });
}
