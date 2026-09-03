import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { listen } from "@tauri-apps/api/event";
import { supabase } from "./supabase";

const REDIRECT_URL = "academicos://auth-callback";

/**
 * Opens Google's consent screen in the SYSTEM browser (never an in-app
 * webview — this is what lets the user's existing Google session and any
 * password manager work normally, and is what Google's own policies expect
 * from a native app). supabase-js defaults to the PKCE flow, so the
 * callback arrives as `academicos://auth-callback?code=...`, exchanged
 * below — never as a hash-fragment access token.
 */
export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: REDIRECT_URL,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (data.url) await openUrl(data.url);
}

async function completeSignIn(url: string): Promise<void> {
  const code = new URL(url).searchParams.get("code");
  if (!code) return;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) console.error("Sign-in failed:", error.message);
}

/**
 * Wires up both paths a Windows deep-link callback can arrive by:
 *  - onOpenUrl: the plugin's native event (macOS/Linux, and some Windows cases)
 *  - "oauth-callback": emitted by the Rust single-instance handler (src-tauri/src/lib.rs)
 *    when the OS spawns a second process for the academicos:// URL while
 *    this app is already running — the realistic case for this flow, since
 *    the app is the one that opened the browser in the first place.
 * Call once at app startup; call the returned function on teardown.
 */
export async function initDeepLinkAuthListener(): Promise<() => void> {
  const unlistenOpenUrl = await onOpenUrl((urls) => {
    const match = urls.find((u) => u.startsWith(REDIRECT_URL));
    if (match) void completeSignIn(match);
  });

  const unlistenEvent = await listen<string>("oauth-callback", (event) => {
    void completeSignIn(event.payload);
  });

  return () => {
    unlistenOpenUrl();
    unlistenEvent();
  };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
