import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The only two values a client ever needs. Both are public-by-design — the
 * anon key has no power on its own; RLS (supabase/migrations/0001_init.sql)
 * is what actually restricts it. The service_role key must NEVER appear
 * here or in any client bundle — see design manual §9.
 */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
