import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSessionToken,
  getSessionActor,
  getSessionCookieName,
  getSessionTtlSeconds,
  readSessionToken,
  verifySessionToken,
} from "../../src/lib/auth/session";

describe("session auth", () => {
  const originalSecret = process.env.RELAY_SESSION_SECRET;

  beforeEach(() => {
    process.env.RELAY_SESSION_SECRET = "test-session-secret";
  });

  afterEach(() => {
    process.env.RELAY_SESSION_SECRET = originalSecret;
    vi.useRealTimers();
  });

  it("issues and verifies signed session tokens", async () => {
    const now = Date.UTC(2026, 3, 4, 12, 0, 0);
    const token = await createSessionToken(now, {
      method: "github",
      provider: "github",
      userId: "user-1",
    });

    await expect(verifySessionToken(token, now + 1_000)).resolves.toBe(true);
    await expect(readSessionToken(token, now + 1_000)).resolves.toMatchObject({
      method: "github",
      provider: "github",
      sub: "user-1",
    });
  });

  it("rejects expired session tokens", async () => {
    const now = Date.UTC(2026, 3, 4, 12, 0, 0);
    const token = await createSessionToken(now);
    const expiredAt = now + getSessionTtlSeconds() * 1000 + 1;

    await expect(verifySessionToken(token, expiredAt)).resolves.toBe(false);
  });

  it("maps payloads into a session actor summary", () => {
    expect(
      getSessionActor({
        exp: Date.now() + 1000,
        v: 1,
        method: "github",
        provider: "github",
        sub: "user-1",
      }),
    ).toEqual({
      method: "github",
      provider: "github",
      userId: "user-1",
    });
  });

  it("builds secure cookie settings for the session", () => {
    const cookie = buildSessionCookie("token-value");

    expect(cookie.name).toBe(getSessionCookieName());
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
  });

  it("builds an expired cookie for logout", () => {
    const cookie = buildExpiredSessionCookie();

    expect(cookie.name).toBe(getSessionCookieName());
    expect(cookie.maxAge).toBe(0);
  });
});
