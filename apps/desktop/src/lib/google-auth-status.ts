import { useSyncExternalStore } from "react";
import { errorBodyText, isGoogleAuthExpiredText } from "./google-auth-logic";

// Whether the server-side Google sign-in has expired, shared between the
// two Google sync loops (which report into it) and the banner (which reads
// it). Kept in localStorage so it survives a restart: the banner should be
// there the moment the app opens, not two minutes later after a sync fails.
// Only a *successful* sync clears it — a flaky network must not hide it.

const KEY = "academicos.googleAuthExpiredSince";
const EVENT = "academicos:google-auth";

export function getGoogleAuthExpiredSince(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

/** Records the failure; keeps the *first* time it was noticed. */
export function markGoogleAuthExpired(): void {
  if (getGoogleAuthExpiredSince()) return;
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {
    /* private mode — banner just won't persist across restarts */
  }
  notify();
}

export function clearGoogleAuthExpired(): void {
  if (!getGoogleAuthExpiredSince()) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

/** Called by a Google sync loop after each run: `null` = success. */
export async function reportGoogleSyncResult(error: unknown): Promise<void> {
  if (error === null || error === undefined) {
    clearGoogleAuthExpired();
    return;
  }
  if (isGoogleAuthExpiredText(await errorBodyText(error))) markGoogleAuthExpired();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // another window changed it
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** ISO time the expiry was first noticed, or null when sign-in is fine. */
export function useGoogleAuthExpiredSince(): string | null {
  return useSyncExternalStore(subscribe, getGoogleAuthExpiredSince, () => null);
}
