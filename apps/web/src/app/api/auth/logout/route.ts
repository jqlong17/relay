import { NextResponse } from "next/server";
import { buildExpiredSessionCookie } from "@/lib/auth/session";
import { buildExpiredSupabaseSessionCookie } from "@/lib/auth/supabase-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(buildExpiredSessionCookie());
  response.cookies.set(buildExpiredSupabaseSessionCookie());
  return response;
}
