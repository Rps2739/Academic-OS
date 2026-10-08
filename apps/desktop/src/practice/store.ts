import type { SqliteLocalDb } from "../lib/sqlite-local-db";

export type ItemStatus = "seen" | "passed";
export interface ItemProgress {
  status: ItemStatus;
  lastCode: string | null;
}

export async function loadProgress(db: SqliteLocalDb): Promise<Map<string, ItemProgress>> {
  const rows = await db.raw.select<{ item_id: string; status: ItemStatus; last_code: string | null }[]>(
    "SELECT item_id, status, last_code FROM practice_progress_local"
  );
  return new Map(rows.map((r) => [r.item_id, { status: r.status, lastCode: r.last_code }]));
}

/** Saves the learner's latest code; never downgrades "passed" to "seen". */
export async function saveCode(db: SqliteLocalDb, itemId: string, code: string): Promise<void> {
  await db.raw.execute(
    `INSERT INTO practice_progress_local (item_id, status, last_code, updated_at) VALUES ($1, 'seen', $2, $3)
     ON CONFLICT(item_id) DO UPDATE SET last_code = excluded.last_code, updated_at = excluded.updated_at`,
    [itemId, code, new Date().toISOString()]
  );
}

export async function markPassed(db: SqliteLocalDb, itemId: string, code: string): Promise<void> {
  await db.raw.execute(
    `INSERT INTO practice_progress_local (item_id, status, last_code, updated_at) VALUES ($1, 'passed', $2, $3)
     ON CONFLICT(item_id) DO UPDATE SET status = 'passed', last_code = excluded.last_code, updated_at = excluded.updated_at`,
    [itemId, code, new Date().toISOString()]
  );
}
