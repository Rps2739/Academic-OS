import { z } from "zod";
import { syncableBase } from "./base";

export const importSource = z.enum(["apps_script", "manual_upload", "forward_poll"]);
export type ImportSource = z.infer<typeof importSource>;

export const timetableImportSchema = syncableBase.extend({
  source: importSource,
  source_message_id: z.string().nullable(),
  received_at: z.string().datetime(),
  week_start: z.string().date(), // YYYY-MM-DD
  raw: z.unknown(), // the original cell grid, kept for audit/replay
  checksum: z.string(),
  parsed_ok: z.boolean().default(false),
  parse_error: z.string().nullable(),
  superseded_by: z.string().uuid().nullable(),
});

export type TimetableImport = z.infer<typeof timetableImportSchema>;

export const sessionStatus = z.enum(["scheduled", "cancelled", "superseded"]);
export type SessionStatus = z.infer<typeof sessionStatus>;

export const classSessionSchema = syncableBase.extend({
  import_id: z.string().uuid(),
  week_start: z.string().date(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  subject_id: z.string().uuid().nullable(),
  subject_label: z.string().min(1), // raw string from the sheet, kept even when matched
  faculty: z.string().nullable(),
  room: z.string().nullable(),
  session_type: z.string().nullable(),
  status: sessionStatus.default("scheduled"),
  gcal_event_id: z.string().nullable(),
});

export type ClassSession = z.infer<typeof classSessionSchema>;

/**
 * A normalised grid cell, produced by parsing the raw .xlsx before it's
 * handed to Gemini (Phase 4) or matched directly (manual upload path).
 * Kept here so both the desktop upload flow and the ingest Edge Function
 * validate against the same shape.
 */
export const rawGridSchema = z.array(z.array(z.union([z.string(), z.number(), z.null()])));
export type RawGrid = z.infer<typeof rawGridSchema>;
