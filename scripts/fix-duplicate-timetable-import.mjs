#!/usr/bin/env node
// One-off cleanup for a specific incident (2026-09-04): a manual
// re-upload of an already-imported timetable file created a second
// timetable_imports row (id c3f7ddee-3b44-4466-8fb6-8152e092515c) with
// the SAME checksum as an existing row (2fc60bf7-...). Postgres's
// `timetable_imports_user_checksum_idx` unique index correctly refuses
// to ever accept it, so this row (and its 12 class_sessions children)
// have been stuck locally with dirty=1 forever, silently blocking the
// desktop app's local->Postgres push for every table that comes AFTER
// timetable_imports in SYNC_TABLES (class_sessions, attendance_marks) —
// push() has no per-table try/catch, so once it throws on the poisoned
// batch it never reaches the tables after it. The code bug that let
// this get created (TimetableUpload.tsx had no checksum check before
// inserting) is already fixed; this only cleans up the one row it
// already produced.
//
// A hard local delete is correct here (not a soft-delete/deleted_at) —
// these rows can never successfully sync to Postgres regardless of what
// field is set on them (the unique-index violation isn't about
// deleted_at), so leaving them in the table in any form keeps them in
// push()'s dirty-row queue forever. They never existed in Postgres, so
// deleting them locally loses nothing there.
//
// CLOSE THE DESKTOP APP FULLY before running this (avoids any chance of
// writing to the SQLite file while the app also has it open). Run from
// the repo root:
//   node scripts/fix-duplicate-timetable-import.mjs

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

const DB_PATH = `${process.env.APPDATA}\\com.academicos.app\\academic-os.db`;
const BAD_IMPORT_ID = "c3f7ddee-3b44-4466-8fb6-8152e092515c";

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH} — is this the right machine/user account?`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

const sessionCount = db.prepare("SELECT COUNT(*) AS n FROM class_sessions WHERE import_id = ?").get(BAD_IMPORT_ID).n;
const importExists = db.prepare("SELECT COUNT(*) AS n FROM timetable_imports WHERE id = ?").get(BAD_IMPORT_ID).n;

console.log(`Found ${sessionCount} class_sessions row(s) and ${importExists} timetable_imports row for ${BAD_IMPORT_ID}.`);

if (sessionCount === 0 && importExists === 0) {
  console.log("Nothing to clean up — already fixed or was never created on this machine.");
  process.exit(0);
}

db.exec("BEGIN");
try {
  db.prepare("DELETE FROM class_sessions WHERE import_id = ?").run(BAD_IMPORT_ID);
  db.prepare("DELETE FROM timetable_imports WHERE id = ?").run(BAD_IMPORT_ID);
  db.exec("COMMIT");
  console.log("Done. The Today widget and Calendar sync should look correct next time the app runs.");
} catch (err) {
  db.exec("ROLLBACK");
  console.error("Failed, rolled back:", err);
  process.exit(1);
}

db.close();
