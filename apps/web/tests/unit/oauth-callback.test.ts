import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOAuthCallbackAccessToken } from "../../src/lib/auth/oauth-callback";

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("oauth callback helper", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses an existing Supabase browser session without exchanging the code again", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "existing-token", refresh_token: "refresh-token" } },
      error: null,
    });
    const exchangeCodeForSession = vi.fn();

    const sessionTokens = await resolveOAuthCallbackAccessToken({
      client: {
        auth: {
          exchangeCodeForSession,
          getSession,
        },
      },
      code: "oauth-code",
      storage: createStorage(),
    });

    expect(sessionTokens).toEqual({
      accessToken: "existing-token",
      refreshToken: "refresh-token",
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchanges the OAuth code and marks it as done when no session exists yet", async () => {
    const storage = createStorage();
    const sessionTokens = await resolveOAuthCallbackAccessToken({
      client: {
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: "fresh-token", refresh_token: "fresh-refresh-token" } },
            error: null,
          }),
          getSession: vi.fn().mockResolvedValue({
            data: { session: null },
            error: null,
          }),
        },
      },
      code: "oauth-code",
      storage,
    });

    expect(sessionTokens).toEqual({
      accessToken: "fresh-token",
      refreshToken: "fresh-refresh-token",
    });
    expect(storage.getItem("relay.oauth.callback.oauth-code")).toBe("done");
  });

  it("waits for the first callback attempt to persist the session before giving up", async () => {
    vi.useFakeTimers();

    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: "reused-token", refresh_token: "reused-refresh-token" } }, error: null });
    const exchangeCodeForSession = vi.fn();

    const promise = resolveOAuthCallbackAccessToken({
      client: {
        auth: {
          exchangeCodeForSession,
          getSession,
        },
      },
      code: "oauth-code",
      maxAttempts: 3,
      storage: createStorage({ "relay.oauth.callback.oauth-code": "processing" }),
      waitMs: 50,
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({
      accessToken: "reused-token",
      refreshToken: "reused-refresh-token",
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("clears the processing marker when the code exchange fails", async () => {
    const storage = createStorage();

    await expect(
      resolveOAuthCallbackAccessToken({
        client: {
          auth: {
            exchangeCodeForSession: vi.fn().mockResolvedValue({
              data: { session: null },
              error: new Error("exchange failed"),
            }),
            getSession: vi.fn().mockResolvedValue({
              data: { session: null },
              error: null,
            }),
          },
        },
        code: "oauth-code",
        storage,
      }),
    ).rejects.toThrow("exchange failed");

    expect(storage.getItem("relay.oauth.callback.oauth-code")).toBeNull();
  });
});
