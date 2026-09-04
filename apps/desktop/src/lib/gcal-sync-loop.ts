import { supabase } from "./supabase";

const INTERVAL_MS = 5 * 60 * 1000; // classes don't change minute-to-minute like tasks do — the automated ingest path already pushes immediately on import, this just covers manual entry/upload while the app is open

/**
 * Periodically calls the gcal-sync Edge Function, which reads/writes
 * Postgres `class_sessions` directly against the caller's own dedicated
 * "Academic OS — Classes" calendar. `onSynced` should trigger the
 * regular local<->Postgres sync engine's pull so a freshly-created
 * gcal_event_id reaches the SQLite mirror promptly.
 */
export function createGCalSyncController(onSynced: () => void) {
  let syncing = false;
  let intervalHandle: ReturnType<typeof setInterval> | undefined;

  async function runOnce(): Promise<void> {
    if (syncing) return;
    syncing = true;
    try {
      const { error } = await supabase.functions.invoke("gcal-sync");
      if (error) {
        console.error("Google Calendar sync failed:", error);
      } else {
        onSynced();
      }
    } finally {
      syncing = false;
    }
  }

  function start(): () => void {
    void runOnce();
    intervalHandle = setInterval(() => void runOnce(), INTERVAL_MS);
    return () => {
      if (intervalHandle) clearInterval(intervalHandle);
    };
  }

  return { start, runOnce };
}
