import Database from "@tauri-apps/plugin-sql";
import {
  JSON_COLUMNS,
  PK_COLUMN,
  SYNTHETIC_COLUMNS,
  TABLE_COLUMNS,
  type LocalDb,
  type LocalRow,
  type SyncRow,
  type TableName,
} from "@academic-os/core";

const DB_URL = "sqlite:academic-os.db";

function jsonColumnsFor(table: TableName): Set<string> {
  return new Set(JSON_COLUMNS[table] ?? []);
}

/** Row as it comes back from sqlite: JSON columns are strings, decode them. */
function decodeRow(table: TableName, raw: Record<string, unknown>): LocalRow {
  const json = jsonColumnsFor(table);
  const pk = PK_COLUMN[table];
  const out: Record<string, unknown> = { ...raw };

  for (const col of json) {
    if (typeof out[col] === "string") {
      try {
        out[col] = JSON.parse(out[col] as string);
      } catch {
        // leave as raw string — malformed data shouldn't crash a read
      }
    }
  }
  if (pk !== "id") {
    out["id"] = out[pk];
  }
  for (const col of SYNTHETIC_COLUMNS[table] ?? []) {
    if (!(col in out)) out[col] = null;
  }
  out["dirty"] = out["dirty"] === 1 || out["dirty"] === true;
  return out as LocalRow;
}

/** Encode a row for writing: JSON columns become strings, `id` maps back to the real PK column name. */
function encodeRow(table: TableName, row: Partial<SyncRow>): Record<string, unknown> {
  const json = jsonColumnsFor(table);
  const pk = PK_COLUMN[table];
  const strip = new Set(["dirty", ...(SYNTHETIC_COLUMNS[table] ?? [])]);
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (strip.has(key)) continue;
    const targetKey = key === "id" && pk !== "id" ? pk : key;
    out[targetKey] = json.has(targetKey) && value !== null && value !== undefined ? JSON.stringify(value) : value;
  }
  return out;
}

function localColumns(table: TableName): string[] {
  return [...Object.keys(TABLE_COLUMNS[table]), "dirty"];
}

/**
 * The real LocalDb for the desktop app, backed by @tauri-apps/plugin-sql.
 * Behaviourally identical to InMemoryLocalDb (packages/core/src/sync) —
 * every method here mirrors that reference implementation's contract.
 * SQLite bind placeholders here are $1, $2, ... (this driver's convention,
 * not `?`).
 */
export class SqliteLocalDb implements LocalDb {
  private constructor(private readonly db: Database) {}

  static async open(): Promise<SqliteLocalDb> {
    const db = await Database.load(DB_URL);
    return new SqliteLocalDb(db);
  }

  /**
   * Raw access for read paths that don't belong in the LocalDb interface
   * (arbitrary filters, joins, ordering) — e.g. the tree sidebar's "all
   * nodes for this parent" query. Writes should still go through put()/
   * applyRemote() so dirty-tracking stays correct.
   */
  get raw(): Database {
    return this.db;
  }

  async listDirty(table: TableName): Promise<LocalRow[]> {
    const rows = await this.db.select<Record<string, unknown>[]>(`SELECT * FROM ${table} WHERE dirty = 1`);
    return rows.map((r) => decodeRow(table, r));
  }

  async getLocal(table: TableName, id: string): Promise<LocalRow | undefined> {
    const pk = PK_COLUMN[table];
    const rows = await this.db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${table} WHERE ${pk} = $1`,
      [id]
    );
    return rows[0] ? decodeRow(table, rows[0]) : undefined;
  }

  async applyRemote(table: TableName, row: SyncRow): Promise<void> {
    const pk = PK_COLUMN[table];
    const encoded = encodeRow(table, row);
    encoded["dirty"] = 0;
    await this.upsert(table, pk, encoded);
  }

  async clearDirty(table: TableName, id: string, serverUpdatedAt: string): Promise<void> {
    const pk = PK_COLUMN[table];
    await this.db.execute(`UPDATE ${table} SET dirty = 0, updated_at = $1 WHERE ${pk} = $2`, [
      serverUpdatedAt,
      id,
    ]);
  }

  async put(table: TableName, patch: Partial<SyncRow> & { id: string; user_id: string }): Promise<void> {
    const pk = PK_COLUMN[table];
    const existing = await this.getLocal(table, patch.id);
    const now = new Date().toISOString();
    const merged: Record<string, unknown> = {
      created_at: existing?.created_at ?? now,
      deleted_at: existing?.deleted_at ?? null,
      ...existing,
      ...patch,
      updated_at: now,
    };
    const encoded = encodeRow(table, merged as SyncRow);
    encoded["dirty"] = 1;
    await this.upsert(table, pk, encoded);
  }

  private async upsert(table: TableName, pk: string, encoded: Record<string, unknown>): Promise<void> {
    const columns = localColumns(table).filter((c) => c in encoded);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const updates = columns.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`);
    const sql = `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT(${pk}) DO UPDATE SET ${updates.join(", ")}
    `;
    await this.db.execute(
      sql,
      columns.map((c) => encoded[c] ?? null)
    );
  }

  async getMeta(key: string): Promise<string | undefined> {
    const rows = await this.db.select<{ value: string }[]>("SELECT value FROM sync_meta WHERE key = $1", [key]);
    return rows[0]?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.execute(
      "INSERT INTO sync_meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value]
    );
  }

  async appendPageVersion(entry: {
    node_id: string;
    blocks: unknown;
    markdown: string | null;
    device_id: string;
  }): Promise<void> {
    await this.db.execute(
      "INSERT INTO page_versions_local (id, node_id, blocks, markdown, device_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [crypto.randomUUID(), entry.node_id, JSON.stringify(entry.blocks), entry.markdown, entry.device_id, new Date().toISOString()]
    );
  }

  async listPageVersions(nodeId: string) {
    const rows = await this.db.select<
      Array<{ node_id: string; blocks: string; markdown: string | null; device_id: string; created_at: string }>
    >("SELECT node_id, blocks, markdown, device_id, created_at FROM page_versions_local WHERE node_id = $1 ORDER BY created_at DESC", [
      nodeId,
    ]);
    return rows.map((r) => ({ ...r, blocks: JSON.parse(r.blocks) as unknown }));
  }

  async appendSyncConflict(entry: {
    table: TableName;
    row_id: string;
    local_row: unknown;
    remote_row: unknown;
    device_id: string;
  }): Promise<void> {
    await this.db.execute(
      "INSERT INTO sync_conflicts_local (id, table_name, row_id, local_row, remote_row, device_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        crypto.randomUUID(),
        entry.table,
        entry.row_id,
        JSON.stringify(entry.local_row),
        JSON.stringify(entry.remote_row),
        entry.device_id,
        new Date().toISOString(),
      ]
    );
  }

  async listSyncConflicts(table: TableName, rowId: string) {
    const rows = await this.db.select<
      Array<{ table_name: TableName; row_id: string; local_row: string; remote_row: string; device_id: string; created_at: string }>
    >(
      "SELECT table_name, row_id, local_row, remote_row, device_id, created_at FROM sync_conflicts_local WHERE table_name = $1 AND row_id = $2 ORDER BY created_at DESC",
      [table, rowId]
    );
    return rows.map((r) => ({
      table: r.table_name,
      row_id: r.row_id,
      local_row: JSON.parse(r.local_row) as unknown,
      remote_row: JSON.parse(r.remote_row) as unknown,
      device_id: r.device_id,
      created_at: r.created_at,
    }));
  }

  /** Direct children of a folder (or top-level nodes, when parentId is null), ordered for display. */
  async listChildren(parentId: string | null): Promise<LocalRow[]> {
    const rows =
      parentId === null
        ? await this.db.select<Record<string, unknown>[]>(
            "SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC"
          )
        : await this.db.select<Record<string, unknown>[]>(
            "SELECT * FROM nodes WHERE parent_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC",
            [parentId]
          );
    return rows.map((r) => decodeRow("nodes", r));
  }

  /** Root-to-node chain of {id, title}, inclusive of the node itself — used both to
   * expand a tree path down to a node (Subjects/Projects "open in Notes") and to build
   * a matching Drive folder path for an attachment's upload. */
  async getAncestorChain(nodeId: string): Promise<Array<{ id: string; title: string }>> {
    const rows = await this.db.select<Array<{ id: string; title: string; depth: number }>>(
      `WITH RECURSIVE chain(id, title, parent_id, depth) AS (
         SELECT id, title, parent_id, 0 FROM nodes WHERE id = $1
         UNION ALL
         SELECT n.id, n.title, n.parent_id, c.depth + 1
         FROM nodes n JOIN chain c ON n.id = c.parent_id
       )
       SELECT id, title, depth FROM chain ORDER BY depth DESC`,
      [nodeId]
    );
    return rows.map((r) => ({ id: r.id, title: r.title }));
  }

  /** Finds (case-insensitive) or creates a chain of nested folders under the Notes
   * root, e.g. ["SIBM", "Sem 3", "Business Statistics"], returning the final folder's
   * node id. Used to give Subjects/Projects a real home in the Notes tree. */
  async findOrCreateFolderPath(userId: string, segments: string[]): Promise<string> {
    let parentId: string | null = null;
    for (const raw of segments) {
      const segment = raw.trim();
      if (!segment) continue;
      const siblings = await this.listChildren(parentId);
      const existing = siblings.find(
        (n) => n["kind"] === "folder" && (n["title"] as string).toLowerCase() === segment.toLowerCase()
      );
      if (existing) {
        parentId = existing.id as string;
        continue;
      }
      const maxOrder = siblings.reduce((max, s) => Math.max(max, (s["sort_order"] as number) ?? 0), 0);
      const id = crypto.randomUUID();
      await this.put("nodes", {
        id,
        user_id: userId,
        parent_id: parentId,
        kind: "folder",
        title: segment,
        icon: null,
        sort_order: maxOrder + 1,
      });
      parentId = id;
    }
    if (parentId === null) throw new Error("findOrCreateFolderPath requires at least one non-empty segment");
    return parentId;
  }

  /** This device's stable id, created once and persisted in sync_meta. Used to attribute conflict-loser entries in page_versions. */
  async getOrCreateDeviceId(): Promise<string> {
    const existing = await this.getMeta("device_id");
    if (existing) return existing;
    const id = crypto.randomUUID();
    await this.setMeta("device_id", id);
    return id;
  }
}
