import { invoke } from "@tauri-apps/api/core";
import type { SqliteLocalDb } from "./sqlite-local-db";
import { isBackupDue, isCorruptionError, localDay, quickCheckOk, repairStamp } from "./db-health-logic";

// The local SQLite file has gone fully corrupt twice (2026-09-07 and
// 2026-09-28). This is the safety net: a quick integrity check on every
// start, one-click repair (Rust moves the damaged file aside on restart and
// the app rebuilds from Supabase), and 7 rolling daily backups for the
// local-only tables a resync can't restore.

const LAST_BACKUP_KEY = "academicos.lastBackupDay";
const KEEP_BACKUPS = 7;

/** true = healthy. Only a real corruption signal returns false — any other
 * error (e.g. a transient lock) is treated as healthy so we never repair a
 * good database by mistake. */
export async function checkDatabase(db: SqliteLocalDb): Promise<boolean> {
  try {
    return quickCheckOk(await db.raw.select("PRAGMA quick_check"));
  } catch (err) {
    console.error("quick_check failed:", err);
    return !isCorruptionError(err);
  }
}

export async function maybeDailyBackup(db: SqliteLocalDb): Promise<void> {
  const today = localDay(new Date());
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    /* ignore */
  }
  if (!isBackupDue(last, today)) return;
  try {
    const target = await invoke<string>("prepare_backup", { day: today, keep: KEEP_BACKUPS });
    // `target` comes from our own Rust command (a path inside the app's
    // data folder), so escaping quotes is sufficient. VACUUM INTO writes a
    // consistent, compacted copy and is safe while the app is running.
    await db.raw.execute(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    try {
      localStorage.setItem(LAST_BACKUP_KEY, today);
    } catch {
      /* ignore */
    }
  } catch (err) {
    // Never blocks startup; retried next launch.
    console.error("daily backup failed:", err);
  }
}

/** Restarts the app; the damaged file is moved aside before it reopens. */
export async function requestRepair(): Promise<void> {
  await invoke("request_db_repair", { stamp: repairStamp(new Date()) });
}

export async function takeRepairNotice(): Promise<string | null> {
  try {
    return (await invoke<string | null>("take_repair_notice")) ?? null;
  } catch {
    return null;
  }
}

export { isCorruptionError };
