import { SYNC_TABLES, type TableName } from "./tables";
import { systemClock, type Clock, type RemoteDb, type SyncRow } from "./types";

/**
 * A fake Supabase. Assigns updated_at itself on every write — exactly like
 * the real `set_updated_at()` trigger — and always ignores whatever
 * updated_at a client sent, which is the behaviour the whole sync engine
 * depends on.
 */
export class InMemoryRemoteDb implements RemoteDb {
  private readonly tables = new Map<TableName, Map<string, SyncRow>>();

  constructor(private readonly clock: Clock = systemClock) {
    for (const table of SYNC_TABLES) this.tables.set(table, new Map());
  }

  private table(name: TableName): Map<string, SyncRow> {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Unknown sync table: ${name}`);
    return t;
  }

  async push(table: TableName, rows: SyncRow[]): Promise<Array<{ id: string; updated_at: string }>> {
    const t = this.table(table);
    const results: Array<{ id: string; updated_at: string }> = [];
    for (const row of rows) {
      const updated_at = this.clock();
      t.set(row.id, { ...row, updated_at });
      results.push({ id: row.id, updated_at });
    }
    return results;
  }

  async pull(table: TableName, since: string): Promise<SyncRow[]> {
    return [...this.table(table).values()]
      .filter((row) => row.updated_at > since)
      .sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0));
  }
}
