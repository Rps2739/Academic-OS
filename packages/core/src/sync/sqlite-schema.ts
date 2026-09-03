import { SYNC_TABLES, type TableName } from "./tables";

export type SqliteType = "TEXT" | "REAL" | "INTEGER";

/**
 * Column metadata shared by every platform's LocalDb adapter (desktop's
 * tauri-plugin-sql, mobile's expo-sqlite). This is data, not behaviour —
 * each adapter still writes its own SQL using its own driver's binding
 * style; this just means the two clients can never drift on what a local
 * mirror table looks like.
 *
 * Real primary key column per table: everything is `id` except
 * `page_bodies`, which is keyed by `node_id` (see schema/page-body.ts).
 */
export const PK_COLUMN: Record<TableName, string> = {
  subjects: "id",
  projects: "id",
  nodes: "id",
  page_bodies: "node_id",
  tasks: "id",
  attachments: "id",
  timetable_imports: "id",
  class_sessions: "id",
  attendance_marks: "id",
};

/** Columns holding JSON — stored as TEXT locally, parsed on read. */
export const JSON_COLUMNS: Partial<Record<TableName, string[]>> = {
  nodes: [],
  page_bodies: ["blocks"],
  projects: ["team"],
  subjects: ["aliases"],
  timetable_imports: ["raw"],
};

const universalColumns: Record<string, SqliteType> = {
  id: "TEXT",
  user_id: "TEXT",
  created_at: "TEXT",
  updated_at: "TEXT",
  deleted_at: "TEXT",
};

export const TABLE_COLUMNS: Record<TableName, Record<string, SqliteType>> = {
  subjects: {
    ...universalColumns,
    name: "TEXT",
    code: "TEXT",
    term: "TEXT",
    node_id: "TEXT",
    aliases: "TEXT", // JSON array
  },
  projects: {
    ...universalColumns,
    name: "TEXT",
    kind: "TEXT",
    stage: "TEXT",
    deadline: "TEXT",
    team: "TEXT", // JSON array
    node_id: "TEXT",
    status: "TEXT",
  },
  nodes: {
    ...universalColumns,
    parent_id: "TEXT",
    kind: "TEXT",
    title: "TEXT",
    icon: "TEXT",
    sort_order: "REAL",
  },
  page_bodies: {
    // No `id` — the real PK is node_id. user_id/created_at/updated_at kept,
    // no deleted_at (visibility follows the parent node's soft delete).
    node_id: "TEXT",
    user_id: "TEXT",
    blocks: "TEXT", // JSON
    markdown: "TEXT",
    plaintext: "TEXT",
    created_at: "TEXT",
    updated_at: "TEXT",
  },
  tasks: {
    ...universalColumns,
    title: "TEXT",
    notes: "TEXT",
    due_at: "TEXT",
    status: "TEXT",
    priority: "INTEGER",
    completed_at: "TEXT",
    sort_order: "REAL",
    node_id: "TEXT",
    project_id: "TEXT",
  },
  attachments: {
    ...universalColumns,
    node_id: "TEXT",
    drive_file_id: "TEXT",
    filename: "TEXT",
    mime: "TEXT",
    size_bytes: "INTEGER",
    extracted_text: "TEXT",
    local_path: "TEXT",
    ocr_status: "TEXT",
    capture_group_id: "TEXT",
    capture_index: "INTEGER",
  },
  timetable_imports: {
    ...universalColumns,
    source: "TEXT",
    source_message_id: "TEXT",
    received_at: "TEXT",
    week_start: "TEXT",
    raw: "TEXT", // JSON
    checksum: "TEXT",
    parsed_ok: "INTEGER",
    parse_error: "TEXT",
    superseded_by: "TEXT",
  },
  class_sessions: {
    ...universalColumns,
    import_id: "TEXT",
    week_start: "TEXT",
    starts_at: "TEXT",
    ends_at: "TEXT",
    subject_id: "TEXT",
    subject_label: "TEXT",
    faculty: "TEXT",
    room: "TEXT",
    session_type: "TEXT",
    status: "TEXT",
    gcal_event_id: "TEXT",
  },
  attendance_marks: {
    ...universalColumns,
    subject_id: "TEXT",
    class_session_id: "TEXT",
    marked_for: "TEXT",
    state: "TEXT",
  },
};

/** `dirty` is a local-only column (never sent to / received from the server). */
export const DIRTY_COLUMN = "dirty";

/**
 * Columns the generic SyncRow shape always carries but which don't exist as
 * real columns on some tables' actual Postgres table — currently just
 * page_bodies, which has no deleted_at (its visibility follows the parent
 * node's soft delete). Any remote/local adapter must strip these before
 * writing, and synthesize them (as null) when reading.
 */
export const SYNTHETIC_COLUMNS: Partial<Record<TableName, string[]>> = {
  page_bodies: ["deleted_at"],
};

export function allTableNames(): readonly TableName[] {
  return SYNC_TABLES;
}
