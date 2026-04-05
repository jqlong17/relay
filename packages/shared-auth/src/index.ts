const textEncoder = new TextEncoder();

type RelayAgentTokenPayload = {
  deviceId: string;
  exp: number;
  kind: "relay-agent";
  userId: string;
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

function parseAgentToken(token: string) {
  const [payloadPart, signaturePart] = token.split(".");

  if (!payloadPart || !signaturePart) {
    return null;
  }

  try {
    const payloadText = Buffer.from(base64UrlDecode(payloadPart)).toString("utf8");
    const payload = JSON.parse(payloadText) as RelayAgentTokenPayload;

    if (
      payload.v !== 1 ||
      payload.kind !== "relay-agent" ||
      typeof payload.exp !== "number" ||
      typeof payload.deviceId !== "string" ||
      typeof payload.userId !== "string"
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

async function createRelayAgentToken(
  secret: string,
  input: { deviceId: string; ttlMs?: number; userId: string },
  now = Date.now(),
) {
  const ttlMs = input.ttlMs ?? 60_000;
  const payload: RelayAgentTokenPayload = {
    v: 1,
    kind: "relay-agent",
    exp: now + ttlMs,
    deviceId: input.deviceId.trim(),
    userId: input.userId.trim(),
  };
  const payloadText = JSON.stringify(payload);
  const payloadPart = base64UrlEncode(textEncoder.encode(payloadText));
  const signaturePart = base64UrlEncode(await sign(payloadPart, secret));
  return `${payloadPart}.${signaturePart}`;
}

async function readRelayAgentToken(secret: string, token: string | null | undefined, now = Date.now()) {
  if (!token) {
    return null;
  }

  const parsed = parseAgentToken(token);

  if (!parsed || parsed.payload.exp <= now) {
    return null;
  }

  const expectedSignature = base64UrlEncode(await sign(parsed.payloadPart, secret));
  return expectedSignature === parsed.signaturePart ? parsed.payload : null;
}

export { createRelayAgentToken, readRelayAgentToken };
export type { RelayAgentTokenPayload };
