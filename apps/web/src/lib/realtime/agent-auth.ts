import { readRelayAgentToken } from "@relay/shared-auth";

function getRelaySessionSecret() {
  const value = process.env.RELAY_SESSION_SECRET?.trim();
  return value && value.length > 0 ? value : null;
}

async function readAgentAuthorization(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  const secret = getRelaySessionSecret();

  if (!token || !secret) {
    return null;
  }

  return await readRelayAgentToken(secret, token);
}

export { readAgentAuthorization };
