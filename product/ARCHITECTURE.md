# Academic OS: Architecture and decisions

## System overview

```
┌──────────────────────── Laptop ────────────────────────┐
│ Tauri shell (Rust): window, tray, shortcut, widgets    │
│   └─ React UI ── reads/writes ── SQLite (local copy)   │
│                    └─ background sync ───────────┐     │
└───────────────────────────────────────────────────┼─────┘
┌──────────────────── Supabase (cloud) ────────────┼─────┐
│ Postgres (row-level security) ◄──────────────────┘     │
│ Edge Functions (hold Google and Gemini keys) ──► Google│
└────────────────────────────────────────────────────────┘
        ▲
College Gmail → Apps Script → timetable-ingest function → Gemini → Calendar
```

## Repository layout

| Path | What it holds |
|---|---|
| `apps/desktop/src` | React UI: notes, tasks, subjects, projects, timetable, widgets |
| `apps/desktop/src-tauri` | Rust: windows, tray, shortcut, local database migrations |
| `packages/core` | Shared: data schemas (Zod), sync engine, timetable parser |
| `supabase/functions` | Edge Functions: Drive, Google Tasks, Calendar, timetable ingest, GD prep |
| `supabase/migrations` | Postgres schema |

## Sync engine (local-first)

- Every local change marks the row **dirty**. Each sync round **pulls** changes since the last cursor, then **pushes** dirty rows.
- Pulling first means a conflict is still detectable while the local row is unsynced.
- Conflicts: the newer timestamp wins, and for notes the losing version is **archived**, not lost.
- Each table syncs separately, so one bad row can't block the rest. This was added after a real incident.

## Timetable pipeline

| Path | How | Why |
|---|---|---|
| Manual upload | SheetJS parses the Excel grid, including merged cells | One known layout, so fixed parsing is free and predictable |
| Automatic | An Apps Script forwards the email attachment; an Edge Function asks Gemini to extract the grid, writes the sessions and creates Calendar events | The emailed version varies, and an LLM absorbs that variation |

The pipeline runs server-side because it needs Google credentials and the Gemini key, which must never ship inside a desktop app.

## Security

- **Row-level security** in Postgres: every row is visible only to its owner.
- **Secrets only in Edge Functions**; the desktop app holds none.
- **Drive access limited to files the app created.**
- **Prompt-injection guard:** the AI only picks numbered items; the server maps numbers back to links it has already checked.
- **Practice-lab sandbox:** Python runs in WebAssembly inside a separate background thread that can't reach the app's data.

## Decision log

| Decision | Alternative considered | Why this way |
|---|---|---|
| Tauri | Electron | A few MB instead of ~150 MB; uses the operating system's own browser engine |
| Local-first SQLite plus sync | A cloud-only app | Instant and offline; a personal tool is used constantly |
| Last-write-wins plus a version archive | CRDTs or a sync library | One user on 1–2 devices; the archive covers the real risk at a fraction of the complexity |
| Gemini only for the emailed timetable | AI for every import | Fixed parsing is reliable and free when the format is known |
| Sign-in via a local loopback server | A custom URL scheme | The URL scheme was fragile on Windows |
| Widgets pinned below other windows | Always on top | They were intrusive; now they dock out of the way |
| Undo toast | A confirm dialog | Less friction; deletes are soft and reversible |
| Daily backup and self-repair | Manual recovery | After two real corruptions |
