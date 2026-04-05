import { NextResponse } from "next/server";
import { buildExpiredSessionCookie } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(buildExpiredSessionCookie());
  return response;
}
