# Academic OS: one desktop workspace for MBA life

Notes, tasks, timetable, attendance and projects in one fast Windows app. It reads the timetable my college emails every week and puts each class on Google Calendar automatically.

> **Demo video:** _add link here_  ·  **Download (Windows):** _add a link to the GitHub Release here_

---

## The problem

An MBA week is spread across too many places: the timetable arrives as an Excel attachment by email (and gets revised mid-week), notes live in one app, tasks in another, attendance in your head, and case-competition deadlines in WhatsApp.

The weekly timetable was the sharpest pain. Copying classes into a calendar by hand every week, then catching each revision, is slow and easy to get wrong.

## Who it's for

Built for myself as a daily driver, and designed for any MBA student with a dense, changing schedule. **I use it every day**, so most features came from real friction I hit.

## What it does

| Area | What you get |
|---|---|
| **Timetable automation** | The college's weekly timetable email is picked up automatically. Gemini reads the grid and each class becomes a Google Calendar event. Mid-week revisions update the calendar. A manual `.xlsx` import is also available. |
| **Notes** | Folders and Notion-style pages, with search, reading view and undo on delete |
| **Tasks** | Due dates and priorities, with two-way Google Tasks sync |
| **Subjects and attendance** | Courses are found from the timetable; mark present or absent and see a running % |
| **Projects** | Case competitions and group work with deadline, team and stage |
| **GD Prep** | Collects news stories worth discussing in group discussions and interviews, each with an AI-written prep note |
| **Practice lab and Interviewer** | Practise SQL and Python offline (auto-checked), plus interview questions with checklists and spaced repetition |
| **Desktop widgets** | Today's classes and tasks pinned on the desktop; `Ctrl+Alt+N` quick capture |

## Key product decisions

| Decision | Why |
|---|---|
| **Local-first** (data saved on the laptop, synced to the cloud in the background) | Every click is instant and it works offline. A cloud-only app would wait on the network for every action. |
| **AI only where inputs vary** | The manual Excel import uses fixed parsing (free and predictable). Gemini is used only for the emailed timetable, whose format changes. |
| **AI chooses from a list, never writes links** | The news feature sends Gemini numbered headlines and it may only pick numbers. A malicious headline can't trick it into returning a harmful link (prompt-injection defence). |
| **Free-tier aware** | The Gemini free quota is shared, so the timetable import retries and the news feature gives up quietly. Missing a timetable matters; missing a news story doesn't. |
| **Undo instead of "Are you sure?"** | Confirmation dialogs on every delete were friction. Deletes happen at once, with a few seconds to undo. |
| **Self-repair and daily backups** | After two database corruptions: a health check on every start, a daily backup and a one-click repair that re-downloads from the cloud |

More decisions and the reasoning behind them: [`product/ARCHITECTURE.md`](product/ARCHITECTURE.md)

## Docs

| Document | What's in it |
|---|---|
| [`product/PRD.md`](product/PRD.md) | Problem, users, goals and metrics, requirements, priorities |
| [`product/ARCHITECTURE.md`](product/ARCHITECTURE.md) | System design, sync engine, security, decision log |

## Tech stack

Tauri v2 (Rust) · React · TypeScript · Vite · SQLite (local) · Supabase (Postgres with row-level security, Edge Functions) · Google Calendar, Tasks and Drive APIs · Gemini API · Google Apps Script

## Running it

This is a personal desktop app. To run your own copy you need your own Supabase project and Google Cloud OAuth credentials (see `apps/desktop/.env.example`). Developers can build it with `pnpm install`, then `pnpm --filter desktop tauri build`.

**Status:** in daily use since Sep 2026; built phase by phase.
