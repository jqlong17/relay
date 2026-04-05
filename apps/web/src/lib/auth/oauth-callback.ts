type SupabaseSession = {
  access_token: string;
  refresh_token: string;
};

type SupabaseSessionResult = {
  data: {
    session: SupabaseSession | null;
  };
  error: Error | null;
};

type SupabaseOAuthClient = {
  auth: {
    exchangeCodeForSession(code: string): Promise<SupabaseSessionResult>;
    getSession(): Promise<SupabaseSessionResult>;
  };
};

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const OAUTH_CALLBACK_STORAGE_PREFIX = "relay.oauth.callback.";

function buildOAuthCallbackStorageKey(code: string) {
  return `${OAUTH_CALLBACK_STORAGE_PREFIX}${code}`;
}

async function readExistingAccessToken(client: SupabaseOAuthClient) {
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session
    ? {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      }
    : null;
}

async function wait(delayMs: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

type ResolveOAuthCallbackAccessTokenOptions = {
  client: SupabaseOAuthClient;
  code: string | null;
  maxAttempts?: number;
  storage?: StorageLike | null;
  waitMs?: number;
};

export async function resolveOAuthCallbackAccessToken({
  client,
  code,
  maxAttempts = 12,
  storage = typeof window === "undefined" ? null : window.sessionStorage,
  waitMs = 150,
}: ResolveOAuthCallbackAccessTokenOptions) {
  const existingSession = await readExistingAccessToken(client);
  if (existingSession) {
    return existingSession;
  }

  if (!code) {
    throw new Error("Missing OAuth code");
  }

  const storageKey = buildOAuthCallbackStorageKey(code);
  const state = storage?.getItem(storageKey);

  if (state === "processing" || state === "done") {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const accessToken = await readExistingAccessToken(client);
      if (accessToken) {
        return accessToken;
      }

      if (attempt < maxAttempts - 1) {
        await wait(waitMs);
      }
    }

    if (state === "done") {
      storage?.removeItem(storageKey);
    }

    throw new Error("Missing Supabase session");
  }

  storage?.setItem(storageKey, "processing");

  try {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session?.access_token || !data.session.refresh_token) {
      throw error ?? new Error("Missing Supabase session");
    }

    storage?.setItem(storageKey, "done");
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  } catch (error) {
    storage?.removeItem(storageKey);
    throw error;
  }
}
