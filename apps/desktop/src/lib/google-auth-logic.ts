// Recognising "the Google sign-in the server uses has expired" from a sync
// error, so the app can tell the user instead of failing silently for days
// (it happened 2026-10-03 → 10-08: the OAuth app is in Google's "Testing"
// mode, which kills refresh tokens after 7 days). Pure; no imports, so it is
// unit-testable (google-auth-logic.test.ts).
//
// Only `invalid_grant` counts. `invalid_client` (a wrong client secret) is a
// different problem that renewing the sign-in would NOT fix, so it must not
// trigger the "renew your sign-in" banner.

const EXPIRED = /invalid_grant|token has been expired or revoked/i;

export function isGoogleAuthExpiredText(text: string): boolean {
  return EXPIRED.test(text);
}

interface ReadableBody {
  text?: () => Promise<string>;
  clone?: () => { text: () => Promise<string> };
}

/** Message plus response body of a supabase-js FunctionsHttpError (whose
 * `.context` is the failed Response). Reads a clone so the original body is
 * left untouched for anything else that wants it. Never throws. */
export async function errorBodyText(err: unknown): Promise<string> {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err;
  const e = err as { message?: unknown; context?: ReadableBody };
  const parts: string[] = [];
  if (typeof e.message === "string") parts.push(e.message);
  try {
    const body = e.context?.clone ? e.context.clone() : e.context;
    if (body && typeof body.text === "function") parts.push(await body.text());
  } catch {
    /* body already consumed or unreadable — the message alone is fine */
  }
  return parts.join(" ");
}
