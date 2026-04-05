import type { RelayDevice } from "@relay/shared-types";

import { LocalDeviceService } from "./local-device-service";

type SupabaseDevicePresenceRow = {
  arch?: string;
  created_at?: string;
  hostname?: string;
  last_seen_at?: string | null;
  local_device_id?: string;
  name?: string;
  platform?: string;
  status?: "online" | "offline";
  updated_at?: string;
  user_id?: string;
};

type DevicePresenceServiceOptions = {
  fetchImpl?: typeof fetch;
  heartbeatIntervalMs?: number;
  localDeviceService: LocalDeviceService;
  logger?: Pick<Console, "error" | "info" | "warn">;
  supabaseAnonKey?: string | null;
  supabaseUrl?: string | null;
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

class DevicePresenceService {
  private readonly fetchImpl: typeof fetch;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly localDeviceService: LocalDeviceService;
  private readonly logger: Pick<Console, "error" | "info" | "warn">;
  private readonly supabaseAnonKey: string | null;
  private readonly supabaseUrl: string | null;

  constructor(options: DevicePresenceServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.localDeviceService = options.localDeviceService;
    this.logger = options.logger ?? console;
    this.supabaseAnonKey = options.supabaseAnonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? null;
    this.supabaseUrl =
      options.supabaseUrl ??
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ??
      process.env.SUPABASE_URL?.trim() ??
      null;
  }

  isConfigured() {
    return this.supabaseUrl !== null && this.supabaseAnonKey !== null;
  }

  start() {
    if (!this.isConfigured() || this.heartbeatTimer) {
      return;
    }

    void this.syncPresence().catch((error: unknown) => {
      this.logger.error("Failed to publish Relay device presence.", error);
    });

    this.heartbeatTimer = setInterval(() => {
      void this.syncPresence().catch((error: unknown) => {
        this.logger.error("Failed to refresh Relay device presence.", error);
      });
    }, this.heartbeatIntervalMs);
  }

  stop() {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async syncPresence(device = this.localDeviceService.getDevice()) {
    if (!this.isConfigured()) {
      return null;
    }

    if (device.bindingStatus !== "bound" || !device.boundUserId) {
      return null;
    }

    const response = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/rpc/upsert_device_presence`, {
      method: "POST",
      headers: {
        apikey: this.supabaseAnonKey ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_bound_user_id: device.boundUserId,
        p_local_device_id: device.id,
        p_name: device.name,
        p_hostname: device.hostname,
        p_platform: device.platform,
        p_arch: device.arch,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = raw;

      try {
        const parsed = JSON.parse(raw) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? raw;
      } catch {}

      throw new Error(message || "Device presence sync failed.");
    }

    const payload = (await response.json()) as SupabaseDevicePresenceRow[] | SupabaseDevicePresenceRow;
    const row = Array.isArray(payload) ? payload[0] : payload;

    return this.mapCloudPresence(device, row);
  }

  private mapCloudPresence(device: RelayDevice, row?: SupabaseDevicePresenceRow | null): RelayDevice {
    const now = new Date().toISOString();

    return {
      id: device.id,
      name: row?.name?.trim() || device.name,
      hostname: row?.hostname?.trim() || device.hostname,
      platform: row?.platform?.trim() || device.platform,
      arch: row?.arch?.trim() || device.arch,
      status: row?.status === "offline" ? "offline" : "online",
      bindingStatus: device.bindingStatus,
      boundUserId: device.boundUserId,
      createdAt: row?.created_at?.trim() || device.createdAt,
      updatedAt: row?.updated_at?.trim() || now,
      lastSeenAt: row?.last_seen_at?.trim() || now,
    };
  }
}

export { DEFAULT_HEARTBEAT_INTERVAL_MS, DevicePresenceService };
