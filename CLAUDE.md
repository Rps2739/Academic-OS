# Academic OS

A personal academic management desktop app for an MBA student at SIBM Bengaluru (Batch 2025-27). Tauri v2 + React frontend, Supabase/Postgres backend, local-first with a SQLite mirror. Built phase-by-phase against a design manual the user supplied in an earlier conversation (not stored in this repo — its phase numbers show up in code comments like "design manual §4.3"; if a comment references a section you can't find, ask the user rather than guessing its contents).

**Read `memory/project_phase_status.md` and `memory/project_next_audit_task.md` before starting any work in this repo** — the second one describes exactly what the user is about to ask you to do next (a full bug/logic audit + UI/UX pass), including what's already known-uncertain so it isn't re-discovered from scratch.

## Stack

- **Desktop shell**: Tauri v2 (`apps/desktop/src-tauri`) — Rust backend, multi-window (main + two desktop widgets, pinned below other windows via `alwaysOnBottom` rather than floating on top + on-demand quick-capture, which stays `alwaysOnTop`), system tray, global shortcut (`Ctrl+Alt+N` quick capture), autostart, window-state persistence.
- **Frontend**: React + Vite (`apps/desktop/src`), BlockNote editor for notes, OKLCH-token dark-first design system in `App.css`.
- **Backend**: Supabase — Postgres with RLS (`auth.uid()`-scoped), Edge Functions (Deno) for anything needing server-held secrets (Google OAuth tokens).
- **Shared logic**: `packages/core` — Zod schemas, the local↔remote sync engine, SQLite local-mirror schema, the timetable parser.
- **Local-first sync**: a SQLite mirror (`apps/desktop/src-tauri`, `tauri-plugin-sql`) syncs against Postgres via `packages/core/src/sync/engine.ts`, with a `dirty` flag per row and a pull cursor in `sync_meta`. `packages/core/src/sync/tables.ts` (`SYNC_TABLES`) decides which whole tables sync; `packages/core/src/sync/sqlite-schema.ts` (`TABLE_COLUMNS`, `PK_COLUMN`, `JSON_COLUMNS`) decides column-level shape locally. `push()` isolates each table's failure in its own try/catch (a poisoned row in one table no longer silently blocks every table listed after it in `SYNC_TABLES` — see `memory/project_timetable_dedup_bug.md` for the incident that found this gap).

## Repo layout

```
apps/desktop/src-tauri/   Rust: window/tray/shortcut setup, local SQLite migrations (lib.rs)
apps/desktop/src/         React app: components/ (main window), widgets/ (desktop widget windows), lib/ (supabase client, sync loops, local db wrapper)
packages/core/src/
  schema/                 Zod schemas per table (source of truth for shape/validation)
  sync/                   sync engine + local SQLite schema declarations
  timetable/              xlsx timetable parser (normalize.ts) + its tests
  attachments/            client-side text extraction for search
  api/                    typed Supabase remote-db client
supabase/functions/       Edge Functions (Deno) — drive-upload, drive-fetch, gtasks-sync, gcal-sync, timetable-ingest, _shared/
supabase/migrations/      Postgres schema, applied manually (see Operational constraints)
samples/                  gitignored — real timetable .xlsx fixtures, see below
scripts/                  one-off scripts the user runs themselves — OAuth refresh token bootstrap, the college Apps Script watcher's reference copy, a Desktop-shortcut launcher, and any one-off DB cleanup scripts
```

## Adding a column to a synced table (do all of these, or sync silently drops data)

1. `supabase/migrations/000N_*.sql` — new Postgres migration (user applies manually, see below)
2. `packages/core/src/sync/sqlite-schema.ts` — add to that table's entry in `TABLE_COLUMNS`
3. `apps/desktop/src-tauri/src/lib.rs`, `migrations()` — **add a new `Migration` with a higher `version`** (e.g. `ALTER TABLE ... ADD COLUMN`). Do not edit an already-shipped version's SQL in place — `tauri-plugin-sql` tracks applied versions by number in the user's existing local db file, so an edited-in-place old version won't rerun.
4. `packages/core/src/schema/*.ts` — update the matching Zod schema if it's actually used for validation somewhere (some, like `timetableImportSchema`, are currently unused/aspirational — check before assuming a change there matters)

`SYNC_TABLES` in `packages/core/src/sync/tables.ts` only needs a change when adding a whole new *table*, not a column.

## Operational constraints (do not deviate)

- **Never handle Supabase DB passwords.** `supabase db push` needs `SUPABASE_DB_PASSWORD`, which isn't available here. Instead, hand the user the raw SQL and have them run it via the Supabase Dashboard → SQL Editor. (Note: this session found that `npx supabase functions deploy <name>` itself DOES work directly from an assistant's shell without touching any secret — that's fine to run directly; it's specifically the DB password and raw OAuth/API secrets that must never pass through the assistant.)
- **Never let OAuth refresh tokens/secrets pass through the assistant.** The user runs `npx supabase secrets set ...` themselves, in their own terminal. `scripts/get-google-refresh-token.mjs` is a one-time bootstrap script the user runs locally, never something to execute on their behalf and relay output from.
- **`samples/` is gitignored on purpose** — it holds real timetable files with real faculty names and room numbers. Tests that need them (`packages/core/src/timetable/normalize.test.ts`) read straight off disk with `describe.skipIf(!haveFixtures)`, never as committed fixtures. Don't try to commit anything from that folder, and don't print its file contents into anywhere that leaves the local machine.
- **This repo has no git remote** (fully local) — the user explicitly declined setting one up. Don't suggest pushing/creating one unprompted.
- Windows/Office refuses to open files from the app's own AppData folder — Drive downloads are cached under `%TEMP%/academicos/`, not app-private storage. Keep using that pattern for anything the OS needs to open externally.
- `supabase.functions.invoke()` mis-handles binary responses for non-standard mimetypes (corrupts `.xlsx` downloads) — for any Edge Function returning binary, use a raw `fetch()` with the session JWT attached manually (see `drive-fetch` callers in `AttachmentsRail.tsx` / `TimetableArchive.tsx` for the exact pattern), not `functions.invoke()`.
- Any Edge Function that **doesn't** authenticate via a forwarded Supabase session JWT (e.g. `timetable-ingest`, called by Apps Script with a custom shared-secret header instead) must be deployed with `npx supabase functions deploy <name> --no-verify-jwt`, or Supabase's platform-level gate rejects every request before the function's own code runs. Do not add that flag to functions that *are* called with a real session JWT (`drive-upload`, `drive-fetch`, `gtasks-sync`, `gcal-sync`) — they should keep the platform check on.
- **Direct local SQLite file access for diagnosis is fine and fast** (Python's stdlib `sqlite3`, read-only URI: `sqlite3.connect('file:<path>?mode=ro', uri=True)`; the db lives at `%APPDATA%\com.academicos.app\academic-os.db`). **Never write to it directly** — any real data fix must go through Postgres (hand the user SQL to run via the Supabase Dashboard) or, if the row can genuinely never reach Postgres (e.g. it violates a unique constraint), a small one-off script the user runs themselves (see `scripts/fix-duplicate-timetable-import.mjs` for the pattern) — never a direct write from the assistant, per the "user performs deletion themselves" boundary.
- **A code fix in `scripts/college-timetable-watcher.gs` is not live until manually re-pasted into the Apps Script editor.** The reference copy in this repo and the live script can drift. When debugging a live run's behavior, always ask whether the current script was actually re-pasted before that specific run.
- **Full-desktop screenshots for self-verification are off-limits.** One taken during this project incidentally captured unrelated windows (other Claude Code sessions/projects on the user's screen). Ask the user to verify visually instead, or use narrower, non-visual checks (reading app/window state via commands, log files, or the database) when self-verification is needed.

## Running things

- `pnpm --filter desktop tauri dev` — full app (Rust + Vite), from repo root. Vite is pinned to port 1420 (Tauri expects it fixed). A Desktop shortcut ("Academic OS.lnk", using `scripts/launch-app.bat`) launches this the same way.
- `cd apps/desktop && npx tsc --noEmit` / `cd packages/core && npx tsc --noEmit` — typecheck (no top-level `pnpm typecheck` shortcut has been verified to work across both in this session; check each package directly).
- `cd packages/core && npx vitest run` — the only test suite currently in the repo (sync engine + timetable parser). Parser tests against real fixtures skip automatically if `samples/` isn't present.
- `cargo` is not on PATH in a plain shell on this machine — it's at `%USERPROFILE%\.cargo\bin`. In PowerShell: `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` before any `cargo`/`tauri dev` invocation from a background shell.

## Project phase status

(See `memory/project_phase_status.md` in the assistant's memory for the live/current version of this — it changes faster than this file gets updated. Summary as of the last update below.)

- **Phase 1** (Drive attachments, text extraction, full-text search) — done
- **Phase 2** (task CRUD w/ folder categories, desktop widgets, tray, autostart, quick capture, Google Tasks two-way sync) — done
- **Phase 3** (Android app) — explicitly deferred by the user (needs Android Studio/tooling not yet set up); do not start without asking
- **Phase 4.1–4.3** (timetable xlsx parser, manual upload, archive/version browser) — done
- **Phase 4.4–4.5** (automated ingest: `supabase/functions/timetable-ingest` + `scripts/college-timetable-watcher.gs` on the user's SIBM college Gmail) — done, confirmed working end-to-end, including mid-week revisions sent as replies within an existing email thread. See `memory/project_ingest_pipeline.md` for full architecture and the incident history before assuming behavior or re-explaining the design.
- **Phase 4.6–4.8** (Google Calendar sync) — done, confirmed working end-to-end (every scheduled session has a synced Calendar event; revisions correctly remove the old event and create a new one). See `memory/project_ingest_pipeline.md`.
- **Desktop widgets pinned below other windows** (2026-09-04, this session's last change) — `alwaysOnBottom` replacing `alwaysOnTop` in `tauri.conf.json`. Compiles clean and the app relaunched with it, but **the actual on-screen z-order behavior has not been visually confirmed by either the assistant or the user yet** — verify this before treating it as done.
- **Next requested**: a full pass over the whole app for bugs/logical mistakes plus a UI/UX redesign review. Not started. See `memory/project_next_audit_task.md`.
