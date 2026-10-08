# Reliability — design (minimal)

Sub-project 2 of 4 (Reading → **Reliability** → Practice lab → Interviewer). The user asked for "the least effort and some reliability": no specific crash has been seen; they want the app to be safe, and to recover when something breaks.

## Evidence (2026-09-28, read-only via the running app)

**Missing Postgres tables break every sync round.**
- `sync_meta` holds only `device_id`; `last_pulled_at` has never been stored.
- Every pull round logs these failures, because migrations `0006` and `0007` were never applied in Postgres:
  - `pull(saved_articles) failed … Could not find the table 'public.saved_articles'`
  - the same for `watchlist_items`
- The engine only advances the global cursor when *every* table succeeds (the 2026-09-07 hardening). So every round re-downloads and rewrites every synced row. That is constant pointless write churn on the local file.

**Nothing else looks wrong.**
- No rows are stuck `dirty = 1`.
- `journal_mode = wal`, `synchronous = FULL` (2). These are the strongest durability settings.
- The tray "Quit" calls `app.exit(0)` (`lib.rs:438`).

**Corruption has happened twice, with no backups either time.**
- Full corruption occurred on 2026-09-07 and 2026-09-28 (see memory `project_db_corruption_incidents.md`).
- The 2026-09-28 corruption appeared between the user quitting the app (working) and the rebuilt app's next launch.
- No automatic backups exist.

## Design

### 1. User applies pending migrations (no code)

The assistant hands the user each file's SQL; the user pastes it into the Supabase Dashboard → SQL Editor, one at a time. The assistant never runs `supabase db push` and never touches the DB password.
- `0006_saved_articles.sql`
- `0007_watchlist_items.sql`
- `0008_attendance_od_cancelled.sql`
- `0005_projects_subject_id.sql`: CLAUDE.md says it's also unapplied. Check it first (the user can check whether `projects.subject_id` exists in the Table Editor).

**Expected result:**
- The pull cursor starts advancing, and full re-downloads stop.
- Bookmarks, the watchlist, OD/Cancelled marks and project→subject links reach Postgres.

### 2. Daily local backup

- **When:** at most once per local calendar day, on app start after the DB opens and passes its health check. The last backup date is kept in `localStorage` (`academicos.lastBackupDay`); the file listing is the real source of truth.
- **How:** `VACUUM INTO '<appDataDir>/backups/academic-os-YYYY-MM-DD.db'` through the existing `localDb.raw.execute`. `VACUUM INTO` produces a consistent, compacted copy, is safe while the app is running under WAL, and needs no new dependency.
- **Rust command `prepare_backup_dir() -> Result<String, String>`:** creates `<appDataDir>/backups/` (`std::fs::create_dir_all`), deletes all but the newest 7 `academic-os-*.db` files, and returns the directory path for the JS to build the `VACUUM INTO` target.
  - JS can't create directories or list files there without adding `tauri-plugin-fs` (a new dependency plus permission scope), so this is deliberately a tiny custom command instead.
- **Failure:** logged to the console, never blocks startup, and retried on the next launch (the day marker is only written on success).

### 3. Self-repair on startup

- **Check:** right after `SqliteLocalDb.open()`, run `PRAGMA quick_check`. It's fast, read-only and fine at this DB size.
- **If the result isn't exactly `[{quick_check: "ok"}]`, or the query throws `(code: 11) … malformed`:**
  1. `await db.close()` (tauri-plugin-sql `Database.close`).
  2. Call Rust command `quarantine_database() -> Result<String, String>`. It moves `academic-os.db`, `-wal` and `-shm` (whichever exist) into `<appDataDir>/corrupted-backup-YYYY-MM-DD-HHMM/` using `std::fs::rename`, **never** deleting, and returns that folder path.
  3. Put a one-shot flag in `localStorage` (`academicos.repairedFrom = <folder>`) and call `window.location.reload()`. On reload the plugin creates a fresh DB, runs every migration from v1, and the normal sync loop re-pulls everything from Supabase.
  4. After reload, if the flag is present, show a toast (existing `notify`): "Your local copy was damaged, so the app rebuilt it from your Supabase copy. The damaged file is in <folder>; your latest backup is in backups\." Then clear the flag.
- **Only the main window runs the check and repair.** Widget windows open the same DB; they must not race to quarantine it. Widgets simply show their normal empty/error state until the main window reloads.
- **Data a repair doesn't restore:** the local-only tables (`news_items_local`, `page_versions_local`, `sync_conflicts_local`, `gd_prep_local`, `gd_seen_local`, and the later practice/interview tables). The daily backup (§2) holds them; restoring one is a manual step documented in memory, not automated here.

### Dropped at the user's request (least effort)

Sync status light, event log for root-causing, per-table pull cursors.

## Files

- `apps/desktop/src-tauri/src/lib.rs`: two `#[tauri::command]` fns, registered in `invoke_handler`. They use `app.path().app_data_dir()`, the same directory `tauri-plugin-sql` uses for `sqlite:academic-os.db`. **Verify** that it's `%APPDATA%\com.academicos.app`.
- New `apps/desktop/src/lib/db-health.ts`: `checkAndRepair(db)` and `maybeDailyBackup(db)`.
- `apps/desktop/src/App.tsx`: call both after `SqliteLocalDb.open()` and before the sync controllers start; show the post-repair toast.
- Capability/permission file for the new commands, if the project's Tauri capabilities require an explicit allow-list for custom commands (check `src-tauri/capabilities/`).

## Testing

- **Unit (vitest):** the decision logic in `db-health.ts` (`quick_check` result → ok / repair; backup-due-today logic), with the Tauri invoke mocked.
- **Live:**
  - After the migrations, `sync_meta` gains `last_pulled_at` and the console shows no `pull(...) failed` for two rounds.
  - A backup file appears and passes `PRAGMA integrity_check` when opened read-only (Python `mode=ro`).
  - **Repair path:** never against the live DB. Test by temporarily pointing the check at a scratch copy (a deliberately truncated DB file in the scratchpad), or by exercising `quarantine_database` against a scratch directory. The live file is only ever moved by the real app code when it is genuinely corrupt.
