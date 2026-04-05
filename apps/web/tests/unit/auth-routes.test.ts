import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as logout } from "../../src/app/api/auth/logout/route";
import { POST as supabaseSession } from "../../src/app/api/auth/supabase-session/route";

const supabaseMocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getClaims: supabaseMocks.getClaims,
      getUser: supabaseMocks.getUser,
    },
  })),
}));

describe("auth routes", () => {
  const originalPassword = process.env.RELAY_ACCESS_PASSWORD;
  const originalSecret = process.env.RELAY_SESSION_SECRET;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.RELAY_ACCESS_PASSWORD = "open-sesame";
    process.env.RELAY_SESSION_SECRET = "test-session-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    supabaseMocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  afterEach(() => {
    process.env.RELAY_ACCESS_PASSWORD = originalPassword;
    process.env.RELAY_SESSION_SECRET = originalSecret;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
  });

  it("returns 401 for an invalid password", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
      headers: { "content-type": "application/json" },
    });

    const response = await login(request);
    expect(response.status).toBe(401);
  });

  it("sets a session cookie for a valid password", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "open-sesame" }),
      headers: { "content-type": "application/json" },
    });

    const response = await login(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("relay_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("accepts a Supabase access token and sets the local relay session cookie", async () => {
    const response = await supabaseSession(
      new Request("http://localhost/api/auth/supabase-session", {
        method: "POST",
        body: JSON.stringify({ accessToken: "access-token", refreshToken: "refresh-token" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("relay_session=");
    expect(response.headers.get("set-cookie")).toContain("relay_supabase_session=");
    expect(supabaseMocks.getClaims).toHaveBeenCalledWith("access-token");
  });

  it("falls back to getUser when claims cannot be read", async () => {
    supabaseMocks.getClaims.mockResolvedValue({ data: { claims: null }, error: new Error("claims failed") });

    const response = await supabaseSession(
      new Request("http://localhost/api/auth/supabase-session", {
        method: "POST",
        body: JSON.stringify({ accessToken: "access-token", refreshToken: "refresh-token" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.getUser).toHaveBeenCalledWith("access-token");
  });

  it("clears the session cookie on logout", async () => {
    const response = await logout();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("relay_supabase_session=");
  });
});
