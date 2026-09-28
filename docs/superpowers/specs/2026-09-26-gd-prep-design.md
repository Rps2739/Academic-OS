# GD Prep — design

A News tab that quietly builds a permanent collection of the news most useful for group-discussion (GD) and interview prep, each story with an AI-written prep note.

## Decisions (made with the user, 2026-09-26)

- **Selection:** Gemini picks the stories and writes prep notes. A manual "Add to GD prep" button also exists on every article.
- **Storage:** this laptop only (local SQLite, not synced). Never refreshed or replaced — kept until the user deletes an entry.
- **Frequency (revised the same day):** the user first chose hourly, but their free-tier Gemini key allows only ~20 requests/day, shared with timetable import. Final choice: a scan every **3 hours between 07:00 and 23:00**, and GD Prep never uses more than **10 Gemini requests per quota day** (scans + manual notes; the day resets at midnight US Pacific, as Google's does), leaving at least 10 for timetables. Each run looks only at headlines it hasn't seen before and may pick 0–3 stories.

## What the user sees

- New **GD Prep** tab in News, after Saved (icon: `GraduationCap`).
- Entries grouped by the day they were added, newest first. Each card: headline, source, published date, a theme tag, and a "Manual" badge if hand-added.
- Expanding a card shows the prep note:
  - **Why it matters** — 2–3 sentences
  - **For** / **Against** — 2–3 points each
  - **Key facts** — only numbers/facts present in the source text
  - **Likely GD topic / interview question** — one line
  - Footer: "AI-generated — verify facts before quoting."
- Theme filter chips: All, Economy, Geopolitics, Business, Tech & AI, India & Policy, Environment.
- Per-card actions: open in reader (same paywall rule as the other tabs), open link, delete (with the existing Undo toast).
- Status line at the top: "Last checked 3:05 PM" or "Couldn't check for new stories — Try again".
- On every article row in the other tabs: an "Add to GD prep" icon button. Adding stores the entry immediately, then fills in its prep note; if that call fails the entry stays with a "Generate prep note" button.

## Architecture

### Server: `supabase/functions/gd-prep` (new Edge Function, session-JWT authenticated like `news-fetch`)

- Shared feed code moves from `news-fetch/index.ts` into `_shared/news.ts` (`fetchCategory(category, extraFeeds)`), so both functions use one parser and one set of SSRF guards. `news-fetch`'s behaviour is unchanged.
- Two modes, one endpoint:
  - `{ mode: "scan", seenIds: string[], recentPicks: string[] }` — fetches every category in `FEEDS`, drops items whose id is in `seenIds`, sends the remainder (numbered list: title + summary + source) to Gemini with `recentPicks` (titles picked in the last 7 days) so an ongoing story is only re-picked on a genuinely new development. Returns `{ scannedIds, picks }`.
  - `{ mode: "note", item: {title, summary, source} }` — writes a prep note for one manually added story.
- Gemini call lives in `_shared/gemini.ts` next to the timetable extractor, with a structured `responseSchema`. For `scan`, the model returns **only the index** of each picked headline plus the note fields; the server maps the index back to its own validated item. Links, titles and sources therefore always come from the feed pipeline, never from model output.
- Quota safety: a 429 from Gemini returns `{ rateLimited: true }` immediately — no retry loop (unlike the timetable path, which retries because a missed timetable matters more than a skipped scan). Scan responses carry `geminiCalled` so the app can count them against its daily budget.
- If nothing is new, Gemini is not called at all.

### Client

- `lib.rs` migration **version 9** — two local-only tables (not in `SYNC_TABLES`):
  - `gd_prep_local` — `id` (uuid), `added_at`, `title`, `link`, `source`, `summary`, `published_at`, `theme`, `why`, `points_for` (JSON text), `points_against` (JSON text), `key_facts` (JSON text), `question`, `manual` (0/1). Unique on `link`, so the same story is never stored twice.
  - `gd_seen_local` — `id` (feed item hash), `seen_at`. Pruned to the last 3 days on each run.
- `apps/desktop/src/lib/gd-prep-loop.ts` — same shape as `gcal-sync-loop.ts`: wakes every 15 minutes and scans if 3 hours have passed since the last attempt (remembered across restarts) and it's daytime; enforces the 10-requests/day budget in `localStorage`; skips if a run is in progress; stores picks and seen ids, records last-run time/result in `localStorage` for the status line, and notifies NewsView to reload if it's open.
- `NewsView.tsx` — new `gd` tab + the "Add to GD prep" button. The tab's list and card rendering go in a new `GdPrepPanel.tsx` so NewsView doesn't grow further.

## Security

- Feed text is untrusted input to the model (prompt-injection surface). Mitigations: the model can only choose among our own numbered items and write note text; it cannot supply links. All model output is rendered as plain text via normal JSX, never `dangerouslySetInnerHTML`. Links still pass `safeExternalUrl` before `openUrl`.
- `GEMINI_API_KEY` stays server-side (already set for timetable ingest). No new secrets.
- Server validates and length-caps every model field before returning it.

## Usage

At most 10 Gemini requests a day for GD Prep (about 6 scheduled scans plus a few manual notes), leaving the rest of the ~20/day free-tier allowance for timetable import. Each scan sends only never-before-seen headlines (~10–20k tokens) and skips Gemini entirely when nothing is new. Supabase: a few hundred extra function calls a month, far inside the free plan.

## Testing

- Unit tests (vitest, `packages/core` style, or a scratch script) for the index-mapping and field validation: out-of-range index, duplicate index, over-long fields, missing fields.
- Live verification through the running app over CDP: a scan stores picks, a second immediate scan picks nothing new, a manual add gets a note, delete + Undo works, reloading the tab keeps entries.

## Out of scope

- Syncing to Postgres / phone (can be added later with a migration if the user changes their mind).
- Runs while the app is closed.
