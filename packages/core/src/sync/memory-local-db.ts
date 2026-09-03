import { SYNC_TABLES, type TableName } from "./tables";
import { systemClock, type Clock, type LocalDb, type LocalRow, type SyncRow } from "./types";

interface PageVersionEntry {
  node_id: string;
  blocks: unknown;
  markdown: string | null;
  device_id: string;
  created_at: string;
}

/**
 * Reference LocalDb implementation. Used directly in engine tests, and as
 * the model that the real tauri-plugin-sql / expo-sqlite adapters (Phase 1
 * and 3) must behave identically to.
 */
export class InMemoryLocalDb implements LocalDb {
  private readonly tables = new Map<TableName, Map<string, LocalRow>>();
  private readonly meta = new Map<string, string>();
  private readonly pageVersions: PageVersionEntry[] = [];

  constructor(private readonly clock: Clock = systemClock) {
    for (const table of SYNC_TABLES) this.tables.set(table, new Map());
  }

  private table(name: TableName): Map<string, LocalRow> {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Unknown sync table: ${name}`);
    return t;
  }

  async listDirty(table: TableName): Promise<LocalRow[]> {
    return [...this.table(table).values()].filter((row) => row.dirty);
  }

  async getLocal(table: TableName, id: string): Promise<LocalRow | undefined> {
    return this.table(table).get(id);
  }

  async applyRemote(table: TableName, row: SyncRow): Promise<void> {
    this.table(table).set(row.id, { ...row, dirty: false });
  }

  async clearDirty(table: TableName, id: string, serverUpdatedAt: string): Promise<void> {
    const row = this.table(table).get(id);
    if (!row) return;
    row.dirty = false;
    row.updated_at = serverUpdatedAt;
  }

  async put(table: TableName, patch: Partial<SyncRow> & { id: string; user_id: string }): Promise<void> {
    const t = this.table(table);
    const existing = t.get(patch.id);
    const now = this.clock();
    const merged: LocalRow = {
      created_at: existing?.created_at ?? now,
      deleted_at: existing?.deleted_at ?? null,
      ...existing,
      ...patch,
      updated_at: now,
      dirty: true,
    };
    t.set(patch.id, merged);
  }

  async getMeta(key: string): Promise<string | undefined> {
    return this.meta.get(key);
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  async appendPageVersion(entry: {
    node_id: string;
    blocks: unknown;
    markdown: string | null;
    device_id: string;
  }): Promise<void> {
    this.pageVersions.push({ ...entry, created_at: this.clock() });
  }

  async listPageVersions(nodeId: string): Promise<PageVersionEntry[]> {
    return this.pageVersions.filter((v) => v.node_id === nodeId);
  }
}
