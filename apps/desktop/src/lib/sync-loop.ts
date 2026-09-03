import { sync, SupabaseRemoteDb } from "@academic-os/core";
import type { SqliteLocalDb } from "./sqlite-local-db";
import { supabase } from "./supabase";

const INTERVAL_MS = 5 * 60 * 1000; // design manual §7: app start, every 5 min, on focus
const DEBOUNCE_MS = 2000; // debounced after any local write

/**
 * Wires the sync engine to real triggers: startup, a 5-minute interval,
 * window focus, and a debounced call after local writes. One instance per
 * app session — call start() once, triggerSync() from mutation call sites,
 * stop() on teardown.
 */
export function createSyncController(localDb: SqliteLocalDb, deviceId: string) {
  const remote = new SupabaseRemoteDb(supabase);
  let syncing = false;
  let pending = false;
  let debounceHandle: ReturnType<typeof setTimeout> | undefined;
  let intervalHandle: ReturnType<typeof setInterval> | undefined;

  async function runOnce(): Promise<void> {
    if (syncing) {
      pending = true;
      return;
    }
    syncing = true;
    try {
      await sync(localDb, remote, deviceId);
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      syncing = false;
      if (pending) {
        pending = false;
        void runOnce();
      }
    }
  }

  function triggerSync(): void {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => void runOnce(), DEBOUNCE_MS);
  }

  function onFocus(): void {
    void runOnce();
  }

  function start(): () => void {
    void runOnce();
    intervalHandle = setInterval(() => void runOnce(), INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      if (intervalHandle) clearInterval(intervalHandle);
      if (debounceHandle) clearTimeout(debounceHandle);
      window.removeEventListener("focus", onFocus);
    };
  }

  return { start, triggerSync, runOnce };
}
