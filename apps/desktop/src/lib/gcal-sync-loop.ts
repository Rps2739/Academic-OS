import { supabase } from "./supabase";

const INTERVAL_MS = 2 * 60 * 1000; // same cadence as Google Tasks — this now also pulls events the user adds/edits in Google Calendar, which should show up in the widgets reasonably quickly

/**
 * Periodically calls the gcal-sync Edge Function, which two-way syncs
 * Postgres `class_sessions` with the caller's own dedicated
 * "Academic OS — Classes" calendar. `onSynced` should trigger the
 * regular local<->Postgres sync engine's pull so pulled events (and a
 * freshly-created gcal_event_id) reach the SQLite mirror promptly.
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
