import type { SupabaseClient } from "@supabase/supabase-js";
import { PK_COLUMN, SYNTHETIC_COLUMNS } from "../sync/sqlite-schema";
import type { TableName } from "../sync/tables";
import type { RemoteDb, SyncRow } from "../sync/types";

/**
 * The real backend for RemoteDb — a thin, table-name-aware wrapper over
 * supabase-js. Every table is `id`-keyed from the sync engine's point of
 * view; this adapter is the one place that knows page_bodies is actually
 * keyed by node_id, and that page_bodies has no deleted_at column.
 */
export class SupabaseRemoteDb implements RemoteDb {
  constructor(private readonly client: SupabaseClient) {}

  private toDbRow(table: TableName, row: SyncRow): Record<string, unknown> {
    const pk = PK_COLUMN[table];
    const strip = new Set(["dirty", ...(SYNTHETIC_COLUMNS[table] ?? [])]);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (strip.has(key)) continue;
      if (key === "id" && pk !== "id") {
        out[pk] = value;
        continue;
      }
      // The server trigger owns updated_at exclusively — never send ours.
      if (key === "updated_at") continue;
      out[key] = value;
    }
    return out;
  }

  private fromDbRow(table: TableName, row: Record<string, unknown>): SyncRow {
    const pk = PK_COLUMN[table];
    const out: Record<string, unknown> = { ...row };
    if (pk !== "id") {
      out["id"] = out[pk];
      delete out[pk];
    }
    for (const col of SYNTHETIC_COLUMNS[table] ?? []) {
      if (!(col in out)) out[col] = null;
    }
    return out as SyncRow;
  }

  async push(table: TableName, rows: SyncRow[]): Promise<Array<{ id: string; updated_at: string }>> {
    if (rows.length === 0) return [];
    const pk = PK_COLUMN[table];
    const dbRows = rows.map((r) => this.toDbRow(table, r));

    const { data, error } = await this.client.from(table).upsert(dbRows, { onConflict: pk }).select();
    if (error) throw new Error(`push(${table}) failed: ${error.message}`);

    return (data ?? []).map((row) => {
      const synced = this.fromDbRow(table, row as Record<string, unknown>);
      return { id: synced.id, updated_at: synced.updated_at };
    });
  }

  async pull(table: TableName, since: string): Promise<SyncRow[]> {
    const { data, error } = await this.client
      .from(table)
      .select()
      .gt("updated_at", since)
      .order("updated_at", { ascending: true });
    if (error) throw new Error(`pull(${table}) failed: ${error.message}`);
    return (data ?? []).map((row) => this.fromDbRow(table, row as Record<string, unknown>));
  }
}
