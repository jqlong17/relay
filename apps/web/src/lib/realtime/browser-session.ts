import { getSessionCookieName, readSessionToken } from "@/lib/auth/session";

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

async function readBrowserSession(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = readCookieValue(cookieHeader, getSessionCookieName());
  return await readSessionToken(token);
}

export { readBrowserSession };
