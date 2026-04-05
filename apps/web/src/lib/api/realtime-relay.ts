import type { RelayAgentResponse, RelayDeviceConnectionStatus } from "@relay/shared-types";

type RelayPingResponse = Extract<RelayAgentResponse, { kind: "ping" }>;

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;

    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) {
        message = parsed.error;
      }
    } catch {}

    throw new Error(message || "Request failed");
  }

  return (await response.json()) as T;
}

async function getRelayDeviceConnectionStatus(deviceId: string) {
  return fetchJson<RelayDeviceConnectionStatus>(`/api/realtime/device/status?deviceId=${encodeURIComponent(deviceId)}`, {
    method: "GET",
  });
}

async function pingRelayDevice(deviceId: string) {
  return fetchJson<RelayPingResponse>("/api/realtime/device/ping", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

export { getRelayDeviceConnectionStatus, pingRelayDevice };
