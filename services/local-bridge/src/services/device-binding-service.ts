import type { RelayDevice } from "@relay/shared-types";

type SupabaseBindDeviceRow = {
  arch?: string;
  created_at?: string;
  hostname?: string;
  local_device_id?: string;
  name?: string;
  platform?: string;
  status?: "online" | "offline";
  updated_at?: string;
  user_id?: string;
};

type DeviceBindingServiceOptions = {
  fetchImpl?: typeof fetch;
  supabaseAnonKey?: string | null;
  supabaseUrl?: string | null;
};

class DeviceBindingService {
  private readonly fetchImpl: typeof fetch;
  private readonly supabaseAnonKey: string | null;
  private readonly supabaseUrl: string | null;

  constructor(options: DeviceBindingServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
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

  async bindDevice(code: string, device: RelayDevice) {
    if (!this.isConfigured()) {
      throw new Error("Supabase device binding is unavailable.");
    }

    const response = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/rpc/consume_device_bind_code`, {
      method: "POST",
      headers: {
        apikey: this.supabaseAnonKey ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_code: code,
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

      throw new Error(message || "Device binding failed.");
    }

    const payload = (await response.json()) as SupabaseBindDeviceRow[] | SupabaseBindDeviceRow;
    const row = Array.isArray(payload) ? payload[0] : payload;

    if (!row?.user_id) {
      throw new Error("Supabase device binding returned no bound user.");
    }

    const now = new Date().toISOString();

    return {
      id: device.id,
      name: row.name?.trim() || device.name,
      hostname: row.hostname?.trim() || device.hostname,
      platform: row.platform?.trim() || device.platform,
      arch: row.arch?.trim() || device.arch,
      status: row.status === "offline" ? "offline" : "online",
      bindingStatus: "bound" as const,
      boundUserId: row.user_id.trim(),
      createdAt: row.created_at?.trim() || device.createdAt,
      updatedAt: row.updated_at?.trim() || now,
      lastSeenAt: now,
    };
  }
}

export { DeviceBindingService };
