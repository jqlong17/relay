import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeviceBindCode } from "../../src/lib/api/device-binding";

const supabaseMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSupabaseAnonKey: vi.fn(() => "anon-key"),
  getSupabaseUrl: vi.fn(() => "https://example.supabase.co"),
}));

vi.mock("@/lib/auth/supabase", () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      getSession: supabaseMocks.getSession,
    },
  })),
  getSupabaseAnonKey: supabaseMocks.getSupabaseAnonKey,
  getSupabaseUrl: supabaseMocks.getSupabaseUrl,
}));

describe("device binding api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    supabaseMocks.getSession.mockReset();
    supabaseMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "access-token",
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the GitHub access token explicitly to the bind-code rpc", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ code: "ABCDEF1234", expires_at: "2026-04-05T08:00:00.000Z" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await createDeviceBindCode("device-1", "My Relay Mac");

    expect(result).toEqual({
      code: "ABCDEF1234",
      expiresAt: "2026-04-05T08:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/create_device_bind_code",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          apikey: "anon-key",
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("surfaces Supabase rpc errors instead of collapsing to a generic failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Authentication required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(createDeviceBindCode("device-1", "My Relay Mac")).rejects.toThrow("Authentication required");
  });
});
