const textEncoder = new TextEncoder();

function getConfiguredAccessPassword() {
  const value = process.env.RELAY_ACCESS_PASSWORD?.trim();
  return value && value.length > 0 ? value : null;
}

async function sha256(value: string) {
  const buffer = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return new Uint8Array(buffer);
}

function constantTimeEquals(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

export function isAccessPasswordConfigured() {
  return getConfiguredAccessPassword() !== null;
}

export async function verifyAccessPassword(candidate: string) {
  const configured = getConfiguredAccessPassword();

  if (!configured) {
    return false;
  }

  const [configuredHash, candidateHash] = await Promise.all([sha256(configured), sha256(candidate)]);
  return constantTimeEquals(configuredHash, candidateHash);
}
