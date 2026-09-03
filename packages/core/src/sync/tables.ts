/**
 * Tables the offline sync engine mirrors locally, in FK-safe order (parents
 * before children in both push and pull direction — see design manual §7).
 * `embeddings` and `user_settings` are intentionally absent: server-only,
 * never mirrored to a device.
 */
export const SYNC_TABLES = [
  "subjects",
  "projects",
  "nodes",
  "page_bodies",
  "tasks",
  "attachments",
  "timetable_imports",
  "class_sessions",
  "attendance_marks",
] as const;

export type TableName = (typeof SYNC_TABLES)[number];
