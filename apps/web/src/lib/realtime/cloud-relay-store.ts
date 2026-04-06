import type { RelayAgentEnvelope, RelayAgentRequest, RelayAgentResponse, RelayBridgeHeaders, RelayDeviceConnectionStatus } from "@relay/shared-types";

import { createSupabaseAdminClient } from "@/lib/auth/supabase-admin";

const CLOUD_RELAY_DEVICE_TTL_MS = 90_000;
const CLOUD_RELAY_POLL_INTERVAL_MS = 500;

type DeviceRow = {
  id?: string;
  user_id?: string;
  local_device_id?: string;
  status?: "online" | "offline";
  last_seen_at?: string | null;
};

type RequestRow = {
  id?: string;
  user_id?: string;
  local_device_id?: string;
  kind?: RelayAgentRequest["kind"];
  method?: "DELETE" | "GET" | "PATCH" | "POST" | null;
  path?: string | null;
  headers?: RelayBridgeHeaders | null;
  body?: string | null;
  status?: string;
};

type ResponseRow = {
  id?: number;
  request_id?: string;
  user_id?: string;
  local_device_id?: string;
  kind?: RelayAgentResponse["kind"];
  status?: number | null;
  headers?: RelayBridgeHeaders | null;
  chunk_base64?: string | null;
  error?: string | null;
  responded_at?: string;
};

function wait(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isFreshTimestamp(value: string | null | undefined, ttlMs = CLOUD_RELAY_DEVICE_TTL_MS) {
  if (!value) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && Date.now() - parsed <= ttlMs;
}

async function loadCloudDevice(cloudDeviceId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("devices")
    .select("id, user_id, local_device_id, status, last_seen_at")
    .eq("id", cloudDeviceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function buildConnectionStatus(device: DeviceRow | null): RelayDeviceConnectionStatus {
  const cloudDeviceId = device?.id?.trim() ?? "";
  const isConnected = !!device && device.status !== "offline" && isFreshTimestamp(device.last_seen_at);

  return {
    connected: isConnected,
    connectedAt: isConnected ? device?.last_seen_at?.trim() ?? null : null,
    deviceId: cloudDeviceId,
    userId: isConnected ? device?.user_id?.trim() ?? null : null,
  };
}

async function getCloudRelayConnectionStatus(cloudDeviceId: string, userId: string) {
  const device = await loadCloudDevice(cloudDeviceId, userId);

  if (!device) {
    return null;
  }

  return {
    device,
    status: buildConnectionStatus(device),
  };
}

async function enqueueRelayAgentRequest(input: {
  body?: string;
  headers?: RelayBridgeHeaders;
  kind: RelayAgentRequest["kind"];
  localDeviceId: string;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  path?: string;
  timeoutMs: number;
  userId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const expiresAt = new Date(Date.now() + input.timeoutMs).toISOString();
  const { data, error } = await supabase
    .from("relay_agent_requests")
    .insert({
      user_id: input.userId,
      local_device_id: input.localDeviceId,
      kind: input.kind,
      method: input.method ?? null,
      path: input.path ?? null,
      headers: input.headers ?? {},
      body: input.body ?? null,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const requestId = ((data as { id?: string } | null)?.id ?? "").trim();

  if (!requestId) {
    throw new Error("Relay could not enqueue the cloud request.");
  }

  return requestId;
}

async function claimRelayAgentRequest(userId: string, localDeviceId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_relay_agent_request", {
    p_user_id: userId,
    p_local_device_id: localDeviceId,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? (data[0] as RequestRow | undefined) : undefined;

  if (!row?.id || !row.kind) {
    return null;
  }

  const request: RelayAgentRequest =
    row.kind === "ping"
      ? {
          id: row.id,
          kind: "ping",
          sentAt: new Date().toISOString(),
        }
      : {
          id: row.id,
          kind: "bridge-http",
          method: row.method ?? "GET",
          path: row.path ?? "/",
          headers: row.headers ?? {},
          body: row.body ?? undefined,
          sentAt: new Date().toISOString(),
        };

  return {
    type: "agent.request" as const,
    request,
  } satisfies RelayAgentEnvelope;
}

async function storeRelayAgentResponse(response: RelayAgentResponse) {
  const supabase = createSupabaseAdminClient();
  const headers =
    response.kind === "bridge-http-start"
      ? (response.headers ?? {})
      : {};

  const { error } = await supabase.from("relay_agent_responses").insert({
    request_id: response.requestId,
    user_id: response.userId,
    local_device_id: response.deviceId,
    kind: response.kind,
    status:
      response.kind === "bridge-http-start"
        ? response.status
        : response.kind === "bridge-http-error"
          ? (response.status ?? null)
          : null,
    headers,
    chunk_base64: response.kind === "bridge-http-chunk" ? response.chunkBase64 : null,
    error: response.kind === "bridge-http-error" ? response.error : null,
    responded_at: response.respondedAt,
  });

  if (error) {
    throw error;
  }

  if (response.kind === "ping" || response.kind === "bridge-http-end" || response.kind === "bridge-http-error") {
    const terminalStatus = response.kind === "bridge-http-error" ? "failed" : "completed";
    const { error: updateError } = await supabase
      .from("relay_agent_requests")
      .update({
        status: terminalStatus,
        responded_at: response.respondedAt,
      })
      .eq("id", response.requestId)
      .eq("user_id", response.userId);

    if (updateError) {
      throw updateError;
    }
  }
}

async function loadRelayAgentResponses(requestId: string, afterId = 0) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("relay_agent_responses")
    .select("id, request_id, user_id, local_device_id, kind, status, headers, chunk_base64, error, responded_at")
    .eq("request_id", requestId)
    .order("id", { ascending: true });

  if (afterId > 0) {
    query = query.gt("id", afterId);
  }

  const { data, error } = await query.limit(200);

  if (error) {
    throw error;
  }

  return (data ?? []) as ResponseRow[];
}

async function waitForPingResponse(requestId: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const rows = await loadRelayAgentResponses(requestId);
    const pingRow = rows.find((row) => row.kind === "ping");

    if (pingRow?.user_id && pingRow.local_device_id && pingRow.responded_at) {
      return {
        deviceId: pingRow.local_device_id,
        hostname: "",
        kind: "ping" as const,
        name: "",
        receivedAt: pingRow.responded_at,
        requestId,
        respondedAt: pingRow.responded_at,
        userId: pingRow.user_id,
      };
    }

    await wait(CLOUD_RELAY_POLL_INTERVAL_MS);
  }

  throw new Error("The Relay device did not respond in time.");
}

async function waitForBridgeStart(requestId: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const rows = await loadRelayAgentResponses(requestId);
    const errorRow = rows.find((row) => row.kind === "bridge-http-error");

    if (errorRow?.error) {
      throw new Error(errorRow.error);
    }

    const startRow = rows.find((row) => row.kind === "bridge-http-start");

    if (startRow?.responded_at) {
      return {
        headers: (startRow.headers ?? {}) as RelayBridgeHeaders,
        lastResponseId: startRow.id ?? 0,
        status: typeof startRow.status === "number" ? startRow.status : 200,
      };
    }

    await wait(CLOUD_RELAY_POLL_INTERVAL_MS);
  }

  throw new Error("The Relay device did not start the bridge response in time.");
}

function createBridgeResponseStream(requestId: string, timeoutMs = 30_000, startingAfterId = 0) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let active = true;
      let lastResponseId = startingAfterId;
      const deadline = Date.now() + timeoutMs;

      void (async () => {
        try {
          while (active && Date.now() <= deadline) {
            const rows = await loadRelayAgentResponses(requestId, lastResponseId);

            if (rows.length === 0) {
              await wait(CLOUD_RELAY_POLL_INTERVAL_MS);
              continue;
            }

            for (const row of rows) {
              lastResponseId = row.id ?? lastResponseId;

              if (row.kind === "bridge-http-chunk" && row.chunk_base64) {
                controller.enqueue(Buffer.from(row.chunk_base64, "base64"));
                continue;
              }

              if (row.kind === "bridge-http-error") {
                controller.error(new Error(row.error ?? "Remote bridge request failed."));
                active = false;
                return;
              }

              if (row.kind === "bridge-http-end") {
                controller.close();
                active = false;
                return;
              }
            }
          }

          if (active) {
            controller.error(new Error("The Relay device did not finish the bridge response in time."));
          }
        } catch (error) {
          controller.error(error);
        }
      })();
    },
    cancel() {
      return;
    },
  });
}

async function requestRemoteBridge(input: {
  body?: string;
  headers?: RelayBridgeHeaders;
  localDeviceId: string;
  method: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
  timeoutMs?: number;
  userId: string;
}) {
  const timeoutMs = input.timeoutMs ?? 10_000;
  const requestId = await enqueueRelayAgentRequest({
    kind: "bridge-http",
    userId: input.userId,
    localDeviceId: input.localDeviceId,
    method: input.method,
    path: input.path,
    headers: input.headers,
    body: input.body,
    timeoutMs,
  });
  const start = await waitForBridgeStart(requestId, timeoutMs);

  return new Response(createBridgeResponseStream(requestId, 30_000, start.lastResponseId), {
    status: start.status,
    headers: start.headers,
  });
}

export {
  CLOUD_RELAY_DEVICE_TTL_MS,
  buildConnectionStatus,
  claimRelayAgentRequest,
  getCloudRelayConnectionStatus,
  isFreshTimestamp,
  loadCloudDevice,
  requestRemoteBridge,
  storeRelayAgentResponse,
  waitForPingResponse,
  enqueueRelayAgentRequest,
};
