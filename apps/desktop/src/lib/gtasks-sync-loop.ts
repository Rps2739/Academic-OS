import { supabase } from "./supabase";

const INTERVAL_MS = 2 * 60 * 1000; // more frequent than the main sync loop — this is the whole point of "edit on phone, see it here"

/**
 * Periodically calls the gtasks-sync Edge Function, which reads/writes
 * Postgres `tasks` directly against the caller's own dedicated Google
 * Tasks list. `onSynced` should trigger the regular local<->Postgres
 * sync engine's pull so whatever this writes reaches the SQLite mirror
 * promptly, instead of waiting for its own next 5-minute interval.
 */
export function createGTasksSyncController(onSynced: () => void) {
  let syncing = false;
  let intervalHandle: ReturnType<typeof setInterval> | undefined;

  async function runOnce(): Promise<void> {
    if (syncing) return;
    syncing = true;
    try {
      const { error } = await supabase.functions.invoke("gtasks-sync");
      if (error) {
        console.error("Google Tasks sync failed:", error);
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
