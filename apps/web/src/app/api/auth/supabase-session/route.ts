import { NextResponse } from "next/server";
import { buildSessionCookie, createSessionToken, isSessionConfigured } from "@/lib/auth/session";
import {
  buildSupabaseSessionCookie,
  createSupabaseSessionCookieValue,
} from "@/lib/auth/supabase-session";
import { createSupabaseServerClient, isSupabaseAuthConfigured } from "@/lib/auth/supabase";

type SessionRequestBody = {
  accessToken?: string;
  refreshToken?: string;
};

export async function POST(request: Request) {
  if (!isSessionConfigured() || !isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Supabase auth is unavailable." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as SessionRequestBody;
  const accessToken = body.accessToken?.trim() ?? "";
  const refreshToken = body.refreshToken?.trim() ?? "";

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "Missing Supabase session tokens." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const claimsResult = (await supabase.auth.getClaims(accessToken).catch((error: unknown) => ({
    data: { claims: null },
    error: error instanceof Error ? error : new Error("Failed to read Supabase claims."),
  }))) as {
    data?: {
      claims?: {
        sub?: string;
      } | null;
    };
    error?: Error | null;
  };
  const userIdFromClaims = claimsResult.data?.claims?.sub?.trim() ?? "";

  if (!claimsResult.error && userIdFromClaims.length > 0) {
    const token = await createSessionToken(Date.now(), {
      method: "github",
      provider: "github",
      userId: userIdFromClaims,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(buildSessionCookie(token));
    response.cookies.set(buildSupabaseSessionCookie(await createSupabaseSessionCookieValue({ accessToken, refreshToken })));
    return response;
  }

  const userResult = (await supabase.auth.getUser(accessToken).catch((error: unknown) => ({
    data: { user: null },
    error: error instanceof Error ? error : new Error("Failed to read Supabase user."),
  }))) as {
    data?: {
      user?: {
        id?: string;
      } | null;
    };
    error?: Error | null;
  };
  const userId = userResult.data?.user?.id?.trim() ?? "";

  if (userResult.error || userId.length === 0) {
    console.error("Failed to verify Supabase session for Relay login.", {
      claimsError: claimsResult.error?.message ?? null,
      hasClaimsSub: userIdFromClaims.length > 0,
      userError: userResult.error?.message ?? null,
      hasUserId: userId.length > 0,
      tokenPrefix: accessToken.slice(0, 16),
    });

    return NextResponse.json({ error: "Invalid Supabase session." }, { status: 401 });
  }

  const token = await createSessionToken(Date.now(), {
    method: "github",
    provider: "github",
    userId,
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(buildSessionCookie(token));
  response.cookies.set(buildSupabaseSessionCookie(await createSupabaseSessionCookieValue({ accessToken, refreshToken })));
  return response;
}
