import { SYNC_TABLES, type TableName } from "./tables";
import type { LocalDb, RemoteDb } from "./types";

const LAST_PULLED_AT_KEY = "last_pulled_at";
const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Pull remote changes into the local mirror, resolving conflicts.
 *
 * MUST run before push() within a sync round. This order is deliberate: a
 * row that's dirty locally but stale relative to the server needs to be
 * caught and archived *before* push has a chance to clear its dirty flag —
 * if push ran first, every local edit would already be clean by the time
 * pull looked at it, and no conflict would ever be detected.
 *
 * Each table's pull is isolated in its own try/catch, mirroring push()'s
 * fix for the 2026-09-04 incident — same failure mode, different
 * direction. Without this, a table that errors (e.g. its Postgres
 * migration hasn't been applied yet, or a transient network blip) throws
 * out of the whole function, which — because SYNC_TABLES has a fixed
 * order — skips every table listed after it. Confirmed live: adding
 * saved_articles/watchlist_items to SYNC_TABLES ahead of the user running
 * their Postgres migrations reproduced this exact error (see
 * memory/project_next_audit_task.md).
 *
 * There is only ONE last_pulled_at cursor shared by every table (not one
 * per table), so it must only advance when EVERY table succeeds this
 * round. Advancing it past a still-failing table's own rows — even
 * though the *reason* to advance came from a different, successful
 * table's newer timestamp — would permanently skip that failing table's
 * unsynced rows the moment it starts working again, since the next
 * round's `since` would already be past them. Safer to leave the cursor
 * exactly where it was: every table simply re-pulls the same range next
 * round (wasteful — applyRemote is an idempotent upsert — but never
 * lossy) until the whole round finally goes clean.
 */
async function pull(local: LocalDb, remote: RemoteDb, deviceId: string): Promise<void> {
  const since = (await local.getMeta(LAST_PULLED_AT_KEY)) ?? EPOCH;
  let maxSeen = since;
  let allSucceeded = true;

  for (const table of SYNC_TABLES) {
    try {
      const remoteRows = await remote.pull(table, since);

      for (const remoteRow of remoteRows) {
        if (remoteRow.updated_at > maxSeen) maxSeen = remoteRow.updated_at;

        const localRow = await local.getLocal(table, remoteRow.id);

        if (!localRow || !localRow.dirty) {
          await local.applyRemote(table, remoteRow);
          continue;
        }

        // Conflict: this device has an unpushed edit AND the server has a
        // newer version (someone else's sync landed first). applyRemote()
        // below does a full-row overwrite, so whichever side loses here
        // would otherwise vanish with zero trace — every table gets a
        // safety net, not just page_bodies (see the 2026-09-12 incident:
        // gtasks-sync and timetable-ingest both write directly to Postgres
        // outside this engine, on tables a local edit can easily be
        // in-flight on at the same time).
        if (remoteRow.updated_at > localRow.updated_at) {
          if (table === "page_bodies") {
            await local.appendPageVersion({
              node_id: localRow.id,
              blocks: localRow["blocks"],
              markdown: (localRow["markdown"] as string | null) ?? null,
              device_id: deviceId,
            });
          } else {
            await local.appendSyncConflict({
              table,
              row_id: localRow.id,
              local_row: localRow,
              remote_row: remoteRow,
              device_id: deviceId,
            });
          }
          await local.applyRemote(table, remoteRow);
        }
        // else: local edit is newer than what the server had at pull time —
        // leave it dirty. The push step below will send it up and it becomes
        // the new server truth.
      }
    } catch (err) {
      allSucceeded = false;
      console.error(`pull(${table}) failed, skipping this table for this round:`, err);
    }
  }

  if (allSucceeded) {
    await local.setMeta(LAST_PULLED_AT_KEY, maxSeen);
  }
}

/**
 * Send every locally-dirty row up to the server, table by table.
 *
 * Each table's push is isolated in its own try/catch. Without this, one
 * row that can never satisfy a server-side constraint (e.g. a unique
 * index violation from a bad duplicate) throws out of remote.push(),
 * and — because SYNC_TABLES has a fixed order — every table listed
 * after it would silently stop syncing forever, every round, with
 * nothing to show for it but confusingly stale data days later. This
 * closes exactly that gap (see the 2026-09-04 incident where a
 * duplicate timetable_imports row blocked class_sessions and
 * attendance_marks from ever pushing). It deliberately does NOT also
 * isolate individual rows *within* one table's batch upsert — that
 * would need remote.push() to move off one-upsert-per-table, a bigger
 * change not needed to close this specific failure mode: a poisoned
 * row's own table simply stays dirty and retries next round, same as
 * it already would if the network call itself had failed.
 */
async function push(local: LocalDb, remote: RemoteDb): Promise<void> {
  for (const table of SYNC_TABLES) {
    const dirtyRows = await local.listDirty(table);
    if (dirtyRows.length === 0) continue;

    try {
      const results = await remote.push(table, dirtyRows);
      for (const result of results) {
        await local.clearDirty(table, result.id, result.updated_at);
      }
    } catch (err) {
      console.error(`push(${table}) failed — leaving its rows dirty for the next sync round:`, err);
    }
  }
}

/** One full sync round: pull-resolve-then-push. See pull()'s doc comment for why the order matters. */
export async function sync(local: LocalDb, remote: RemoteDb, deviceId: string): Promise<void> {
  await pull(local, remote, deviceId);
  await push(local, remote);
}

// Exported for targeted testing of each half independently.
export { pull, push };
export type { TableName };
