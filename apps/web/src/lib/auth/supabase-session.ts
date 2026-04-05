const textEncoder = new TextEncoder();
const SUPABASE_SESSION_COOKIE_NAME = "relay_supabase_session";
const SUPABASE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

type SupabaseSessionPayload = {
  accessToken: string;
  exp: number;
  refreshToken: string;
  v: 1;
};

function base64UrlEncode(value: Uint8Array) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function getSessionSecret() {
  const value = process.env.RELAY_SESSION_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

async function sign(value: string, secret: string) {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return new Uint8Array(signature);
}

function parsePayload(token: string) {
  const [payloadPart, signaturePart] = token.split(".");

  if (!payloadPart || !signaturePart) {
    return null;
  }

  try {
    const payloadText = Buffer.from(base64UrlDecode(payloadPart)).toString("utf8");
    const payload = JSON.parse(payloadText) as SupabaseSessionPayload;

    if (
      payload.v !== 1 ||
      typeof payload.exp !== "number" ||
      typeof payload.accessToken !== "string" ||
      typeof payload.refreshToken !== "string"
    ) {
      return null;
    }

    return {
      payload,
      payloadPart,
      signaturePart,
    };
  } catch {
    return null;
  }
}

async function createSupabaseSessionCookieValue(
  input: { accessToken: string; refreshToken: string },
  now = Date.now(),
) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("RELAY_SESSION_SECRET is not configured.");
  }

  const payload: SupabaseSessionPayload = {
    v: 1,
    exp: now + SUPABASE_SESSION_TTL_SECONDS * 1000,
    accessToken: input.accessToken.trim(),
    refreshToken: input.refreshToken.trim(),
  };
  const payloadPart = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const signaturePart = base64UrlEncode(await sign(payloadPart, secret));
  return `${payloadPart}.${signaturePart}`;
}

async function readSupabaseSessionCookieValue(token: string | null | undefined, now = Date.now()) {
  const secret = getSessionSecret();

  if (!token || !secret) {
    return null;
  }

  const parsed = parsePayload(token);

  if (!parsed || parsed.payload.exp <= now) {
    return null;
  }

  const expectedSignature = base64UrlEncode(await sign(parsed.payloadPart, secret));
  return expectedSignature === parsed.signaturePart ? parsed.payload : null;
}

function getSupabaseSessionCookieName() {
  return SUPABASE_SESSION_COOKIE_NAME;
}

function buildSupabaseSessionCookie(value: string) {
  return {
    name: SUPABASE_SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUPABASE_SESSION_TTL_SECONDS,
  };
}

function buildExpiredSupabaseSessionCookie() {
  return {
    name: SUPABASE_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export {
  buildExpiredSupabaseSessionCookie,
  buildSupabaseSessionCookie,
  createSupabaseSessionCookieValue,
  getSupabaseSessionCookieName,
  readSupabaseSessionCookieValue,
};
export type { SupabaseSessionPayload };
