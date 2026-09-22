import type { TableName } from "./tables";

/**
 * A row as the sync engine sees it: every synced table, whatever its real
 * primary key column is named (page_bodies uses node_id, not id — its DB
 * adapter maps that column to `id` before handing rows to the engine).
 * `updated_at` here is always the SERVER's value once a row has been
 * pulled; the engine never trusts a client-authored `updated_at`.
 */
export interface SyncRow {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  [column: string]: unknown;
}

export interface LocalRow extends SyncRow {
  /** True when this row has local changes not yet confirmed on the server. */
  dirty: boolean;
}

/** A monotonically-increasing ISO timestamp source. Real clocks in
 * production; an injectable fake in tests so conflict ordering is
 * deterministic instead of racing real wall-clock time. */
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();

/**
 * The on-device mirror. Implemented per platform (tauri-plugin-sql on
 * desktop, expo-sqlite on mobile) and by an in-memory version for tests.
 * The sync engine (engine.ts) depends only on this interface — it never
 * imports a platform-specific SQLite package.
 */
export interface LocalDb {
  /** Rows with local edits not yet acknowledged by the server. */
  listDirty(table: TableName): Promise<LocalRow[]>;
  /** A single row as currently held locally, if any. */
  getLocal(table: TableName, id: string): Promise<LocalRow | undefined>;
  /** Write a row that came from the server: always clean (dirty = false). */
  applyRemote(table: TableName, row: SyncRow): Promise<void>;
  /** After a successful push, clear the dirty flag and adopt the server's updated_at. */
  clearDirty(table: TableName, id: string, serverUpdatedAt: string): Promise<void>;
  /** A local write (user edit, new row, or a soft delete). Always marks dirty. */
  put(table: TableName, patch: Partial<SyncRow> & { id: string; user_id: string }): Promise<void>;

  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;

  /**
   * The safety net for page_bodies specifically: a losing edit is archived
   * here (with full version history, browsable per node), never discarded.
   */
  appendPageVersion(entry: {
    node_id: string;
    blocks: unknown;
    markdown: string | null;
    device_id: string;
  }): Promise<void>;
  listPageVersions(nodeId: string): Promise<
    Array<{ node_id: string; blocks: unknown; markdown: string | null; device_id: string; created_at: string }>
  >;

  /**
   * The safety net for every OTHER table: page_bodies is the only table
   * with its own version-history mechanism above, so every other table's
   * losing edit in a conflict used to be silently destroyed by
   * applyRemote() with zero trace. This is the generic fallback — not a
   * full version history, just enough to recover a specific lost edit by
   * hand if it's ever reported as "my change disappeared."
   */
  appendSyncConflict(entry: {
    table: TableName;
    row_id: string;
    local_row: unknown;
    remote_row: unknown;
    device_id: string;
  }): Promise<void>;
  listSyncConflicts(table: TableName, rowId: string): Promise<
    Array<{ table: TableName; row_id: string; local_row: unknown; remote_row: unknown; device_id: string; created_at: string }>
  >;
}

/**
 * The server side of sync. In production this is a thin wrapper over the
 * Supabase client (built in Phase 1); in tests it's a fully in-memory fake
 * so the engine's logic can be verified with zero network dependency.
 */
export interface RemoteDb {
  /** Upsert rows; the server assigns updated_at and returns it per row. Client-sent updated_at is ignored. */
  push(table: TableName, rows: SyncRow[]): Promise<Array<{ id: string; updated_at: string }>>;
  /** Rows changed strictly after `since`, oldest first. */
  pull(table: TableName, since: string): Promise<SyncRow[]>;
}
