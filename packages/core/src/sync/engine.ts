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
 */
async function pull(local: LocalDb, remote: RemoteDb, deviceId: string): Promise<void> {
  const since = (await local.getMeta(LAST_PULLED_AT_KEY)) ?? EPOCH;
  let maxSeen = since;

  for (const table of SYNC_TABLES) {
    const remoteRows = await remote.pull(table, since);

    for (const remoteRow of remoteRows) {
      if (remoteRow.updated_at > maxSeen) maxSeen = remoteRow.updated_at;

      const localRow = await local.getLocal(table, remoteRow.id);

      if (!localRow || !localRow.dirty) {
        await local.applyRemote(table, remoteRow);
        continue;
      }

      // Conflict: this device has an unpushed edit AND the server has a
      // newer version (someone else's sync landed first).
      if (remoteRow.updated_at > localRow.updated_at) {
        if (table === "page_bodies") {
          await local.appendPageVersion({
            node_id: localRow.id,
            blocks: localRow["blocks"],
            markdown: (localRow["markdown"] as string | null) ?? null,
            device_id: deviceId,
          });
        }
        await local.applyRemote(table, remoteRow);
      }
      // else: local edit is newer than what the server had at pull time —
      // leave it dirty. The push step below will send it up and it becomes
      // the new server truth.
    }
  }

  await local.setMeta(LAST_PULLED_AT_KEY, maxSeen);
}

/** Send every locally-dirty row up to the server, table by table. */
async function push(local: LocalDb, remote: RemoteDb): Promise<void> {
  for (const table of SYNC_TABLES) {
    const dirtyRows = await local.listDirty(table);
    if (dirtyRows.length === 0) continue;

    const results = await remote.push(table, dirtyRows);
    for (const result of results) {
      await local.clearDirty(table, result.id, result.updated_at);
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
