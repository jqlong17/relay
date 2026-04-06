import { createClient } from "@supabase/supabase-js";

import { getSupabaseUrl } from "@/lib/auth/supabase";

function getSupabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return value && value.length > 0 ? value : null;
}

function createSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin access is not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export { createSupabaseAdminClient, getSupabaseServiceRoleKey };
