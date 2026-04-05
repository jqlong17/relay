import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeviceBindCode } from "../../src/lib/api/device-binding";

describe("device binding api", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a bind code from the Relay server api", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "ABCDEF1234", expiresAt: "2026-04-05T08:00:00.000Z" }), {
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
      "/api/cloud/device-bind-code",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
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
