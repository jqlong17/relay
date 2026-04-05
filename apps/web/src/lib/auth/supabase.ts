import { createClient } from "@supabase/supabase-js";

function readEnv(name: string) {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : name === "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        : name === "SUPABASE_URL"
          ? process.env.SUPABASE_URL
          : name === "SUPABASE_ANON_KEY"
            ? process.env.SUPABASE_ANON_KEY
            : name === "RELAY_PUBLIC_BASE_URL"
              ? process.env.RELAY_PUBLIC_BASE_URL
              : process.env[name];
  return value && value.length > 0 ? value : null;
}

export function getSupabaseUrl() {
  return readEnv("NEXT_PUBLIC_SUPABASE_URL") ?? readEnv("SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? readEnv("SUPABASE_ANON_KEY");
}

export function isSupabaseAuthConfigured() {
  return getSupabaseUrl() !== null && getSupabaseAnonKey() !== null;
}

export function createSupabaseServerClient() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error("Supabase auth is not configured.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createSupabaseBrowserClient() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error("Supabase auth is not configured.");
  }

  return createClient(url, anonKey);
}

export function getPublicBaseUrl(origin: string) {
  const configured = readEnv("RELAY_PUBLIC_BASE_URL");
  return configured ?? origin;
}

export function normalizeNextPath(value: string | null | undefined, fallback: string) {
  if (!value || value.length === 0) {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}
