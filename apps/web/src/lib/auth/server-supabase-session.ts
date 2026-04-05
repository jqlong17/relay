import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getSupabaseSessionCookieName, readSupabaseSessionCookieValue } from "@/lib/auth/supabase-session";

function readCookieValue(cookieHeader: string, name: string) {
  const prefix = `${name}=`;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }

  return null;
}

async function createAuthenticatedSupabaseServerClient(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return createAuthenticatedSupabaseServerClientFromCookieHeader(cookieHeader);
}

async function createAuthenticatedSupabaseServerClientFromCookieHeader(cookieHeader: string) {
  const sessionCookie = readCookieValue(cookieHeader, getSupabaseSessionCookieName());
  const session = await readSupabaseSessionCookieValue(sessionCookie);

  if (!session?.accessToken || !session.refreshToken) {
    throw new Error("GitHub cloud session expired. Please sign in with GitHub again.");
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  if (error || !data.session?.access_token || !data.session.refresh_token) {
    throw new Error("GitHub cloud session expired. Please sign in with GitHub again.");
  }

  return {
    supabase,
    session: data.session,
  };
}

export { createAuthenticatedSupabaseServerClient, createAuthenticatedSupabaseServerClientFromCookieHeader };
