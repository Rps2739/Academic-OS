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
      // PKCE returns the OAuth result as `?code=` on the redirect URL.
      // The desktop app's loopback callback server (src-tauri/src/lib.rs)
      // is a plain HTTP server reading the request's query string — it
      // would never see an implicit-flow `#access_token=` hash fragment,
      // since fragments never leave the browser.
      flowType: "pkce",
    },
  });
}
