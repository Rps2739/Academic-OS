import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "./supabase";

/**
 * Sign-in opens Google's consent screen in the SYSTEM browser (never an
 * in-app webview — this lets the user's existing Google session and any
 * password manager work normally, and is what Google's policies expect
 * from a native app). The OAuth redirect target is a local loopback HTTP
 * server (127.0.0.1) rather than a custom academicos:// URL scheme —
 * Chrome silently drops external-protocol redirects that arrive via
 * Google's own internal redirect chain, but a plain http:// redirect
 * always works. This is the same pattern `gcloud`, the GitHub CLI, and
 * other desktop OAuth clients use. The Rust side (start_oauth_server,
 * src-tauri/src/lib.rs) binds the fixed port below and emits the
 * resulting `code` as an "oauth-callback" event once Google redirects.
 */
export async function signInWithGoogle(): Promise<void> {
  const port = await invoke<number>("start_oauth_server");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `http://127.0.0.1:${port}/callback`,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (data.url) await openUrl(data.url);
}

async function completeSignIn(code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) console.error("Sign-in failed:", error.message);
}

/**
 * Listens for the "oauth-callback" event emitted by the Rust loopback
 * server once Google redirects back with an auth code. Call once at app
 * startup; call the returned function on teardown.
 */
export async function initDeepLinkAuthListener(): Promise<() => void> {
  return listen<string>("oauth-callback", (event) => {
    void completeSignIn(event.payload);
  });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
