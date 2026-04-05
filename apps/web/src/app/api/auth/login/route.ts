import { NextResponse } from "next/server";
import { buildSessionCookie, createSessionToken, isSessionConfigured } from "@/lib/auth/session";
import { isAccessPasswordConfigured, verifyAccessPassword } from "@/lib/auth/password";

type LoginRequestBody = {
  password?: string;
};

export async function POST(request: Request) {
  if (!isAccessPasswordConfigured() || !isSessionConfigured()) {
    return NextResponse.json(
      { error: "Remote access is unavailable. Configure RELAY_ACCESS_PASSWORD and RELAY_SESSION_SECRET first." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as LoginRequestBody;
  const password = body.password?.trim() ?? "";

  if (!(await verifyAccessPassword(password))) {
    return NextResponse.json({ error: "Invalid access password." }, { status: 401 });
  }

  const token = await createSessionToken(Date.now(), {
    method: "password",
    provider: "password",
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(buildSessionCookie(token));
  return response;
}
