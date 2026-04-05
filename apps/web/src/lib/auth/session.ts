const textEncoder = new TextEncoder();
const SESSION_COOKIE_NAME = "relay_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

type SessionAuthMethod = "password" | "github";

type SessionPayload = {
  exp: number;
  method?: SessionAuthMethod | null;
  provider?: SessionAuthMethod | null;
  sub?: string | null;
  v: 1;
};

type SessionActor = {
  method: SessionAuthMethod | null;
  provider: SessionAuthMethod | null;
  userId: string | null;
};

type CreateSessionTokenOptions = {
  method?: SessionAuthMethod | null;
  provider?: SessionAuthMethod | null;
  userId?: string | null;
};

function base64UrlEncode(value: Uint8Array) {
  const base64 = Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return base64;
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
    "verify",
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
    const payload = JSON.parse(payloadText) as SessionPayload;

    if (payload.v !== 1 || typeof payload.exp !== "number") {
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

export function isSessionConfigured() {
  return getSessionSecret() !== null;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}

export async function createSessionToken(now = Date.now(), options: CreateSessionTokenOptions = {}) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("RELAY_SESSION_SECRET is not configured.");
  }

  const payload: SessionPayload = {
    v: 1,
    exp: now + SESSION_TTL_SECONDS * 1000,
    method: options.method ?? null,
    provider: options.provider ?? null,
    sub: options.userId?.trim() || null,
  };
  const payloadText = JSON.stringify(payload);
  const payloadPart = base64UrlEncode(textEncoder.encode(payloadText));
  const signaturePart = base64UrlEncode(await sign(payloadPart, secret));

  return `${payloadPart}.${signaturePart}`;
}

export async function readSessionToken(token: string | null | undefined, now = Date.now()) {
  const secret = getSessionSecret();

  if (!token || !secret) {
    return null;
  }

  const parsed = parsePayload(token);

  if (!parsed) {
    return null;
  }

  if (parsed.payload.exp <= now) {
    return null;
  }

  const expectedSignature = base64UrlEncode(await sign(parsed.payloadPart, secret));
  return expectedSignature === parsed.signaturePart ? parsed.payload : null;
}

export async function verifySessionToken(token: string | null | undefined, now = Date.now()) {
  return (await readSessionToken(token, now)) !== null;
}

export function getSessionActor(payload: SessionPayload | null | undefined): SessionActor | null {
  if (!payload) {
    return null;
  }

  return {
    method: payload.method === "github" ? "github" : payload.method === "password" ? "password" : null,
    provider: payload.provider === "github" ? "github" : payload.provider === "password" ? "password" : null,
    userId: typeof payload.sub === "string" && payload.sub.trim().length > 0 ? payload.sub.trim() : null,
  };
}

export function buildSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function buildExpiredSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export type { CreateSessionTokenOptions, SessionActor, SessionAuthMethod, SessionPayload };
