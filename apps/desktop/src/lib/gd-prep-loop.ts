import { supabase } from "./supabase";
import type { SqliteLocalDb } from "./sqlite-local-db";
import { insertPick, isHttpUrl, loadSeenIds, markSeen, recentPickTitles, setNote, type PrepNote } from "./gd-prep-store";

// GD Prep's background half: a scheduled scan (gd-prep Edge Function, mode
// "scan") that adds 0–3 GD-worthy stories, plus the one-off prep note for
// a story the user adds by hand (mode "note"). Runs while the app is open;
// the app autostarts at login, so that's most of the day.
//
// Quota: the user's free-tier Gemini key allows ~20 requests/day, shared
// with timetable import — which must never be starved. So GD Prep scans at
// most every 3 hours, only in the daytime, and never spends more than
// DAILY_AI_BUDGET requests per quota day. Google resets the limit at
// midnight US Pacific time, so that's the day boundary used here.

const TICK_MS = 15 * 60 * 1000; // how often the timer wakes to see if a scan is due
const SCAN_SPACING_MS = 3 * 60 * 60 * 1000;
const QUIET_START_HOUR = 23; // no automatic scans from 23:00…
const QUIET_END_HOUR = 7; // …until 07:00 local time
export const DAILY_AI_BUDGET = 10;

const STATUS_KEY = "academicos.gdPrepStatus";
const LAST_SCAN_KEY = "academicos.gdPrepLastScan"; // epoch ms of the last scan attempt
const BUDGET_KEY = "academicos.gdPrepBudget"; // JSON { day, used }

const BUDGET_MESSAGE = "Today's AI allowance for GD Prep is used up. Checks resume tomorrow.";

/** Fired on window whenever GD Prep data or status changes, so an open
 * GD Prep tab (or NewsView's "added" markers) can reload. */
export const GD_PREP_EVENT = "academicos:gd-prep-updated";

export function notifyGdPrepChanged(): void {
  window.dispatchEvent(new Event(GD_PREP_EVENT));
}

export interface GdPrepStatus {
  at: string;
  ok: boolean;
  message: string;
}

export function readGdPrepStatus(): GdPrepStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as GdPrepStatus) : null;
  } catch {
    return null;
  }
}

function writeStatus(ok: boolean, message: string): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), ok, message }));
  } catch {
    /* private mode / quota — status line just won't update */
  }
  notifyGdPrepChanged();
}

/** "2026-09-26"-style date in US Pacific time — Gemini's quota day. */
function quotaDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function budgetUsed(): number {
  try {
    const b = JSON.parse(localStorage.getItem(BUDGET_KEY) ?? "null") as { day?: string; used?: number } | null;
    return b && b.day === quotaDay() && typeof b.used === "number" ? b.used : 0;
  } catch {
    return 0;
  }
}

function spendBudget(): void {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify({ day: quotaDay(), used: budgetUsed() + 1 }));
  } catch {
    /* ignore */
  }
}

export function budgetLeft(): number {
  return Math.max(0, DAILY_AI_BUDGET - budgetUsed());
}

function lastScanAt(): number {
  try {
    return Number(localStorage.getItem(LAST_SCAN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function recordScanAttempt(): void {
  try {
    localStorage.setItem(LAST_SCAN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Daytime only, and at least 3 hours since the last attempt — remembered
 * across restarts, so reopening the app doesn't trigger an extra scan. */
function scanIsDue(): boolean {
  const hour = new Date().getHours();
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) return false;
  return Date.now() - lastScanAt() >= SCAN_SPACING_MS;
}

interface ScanPick {
  item: { id: string; title: string; link: string; source: string; summary: string; publishedAt: string };
  note: PrepNote;
}

let scanning: Promise<void> | null = null;

/** Shared by the scheduled timer and the tab's "Check now" button; a second
 * call while one is running just waits for it. */
export function runGdPrepScan(db: SqliteLocalDb): Promise<void> {
  if (!scanning) scanning = scan(db).finally(() => (scanning = null));
  return scanning;
}

async function scan(db: SqliteLocalDb): Promise<void> {
  recordScanAttempt();
  if (budgetLeft() === 0) {
    writeStatus(false, BUDGET_MESSAGE);
    return;
  }
  try {
    const seenIds = await loadSeenIds(db);
    const recentPicks = await recentPickTitles(db);
    const { data, error } = await supabase.functions.invoke("gd-prep", {
      body: { mode: "scan", seenIds, recentPicks },
    });
    if (error) {
      // The server may have reached Gemini before failing: count it, to stay safe.
      spendBudget();
      throw error;
    }
    if (data?.geminiCalled) spendBudget();
    if (data?.rateLimited) {
      writeStatus(false, "Gemini's daily limit was reached. Will try again in 3 hours.");
      return;
    }
    let added = 0;
    for (const p of (data?.picks ?? []) as ScanPick[]) {
      if (!isHttpUrl(p.item.link)) continue;
      const stored = await insertPick(
        db,
        {
          title: p.item.title,
          link: p.item.link,
          source: p.item.source,
          summary: p.item.summary,
          published_at: p.item.publishedAt,
        },
        p.note
      );
      if (stored) added++;
    }
    await markSeen(db, (data?.scannedIds ?? []) as string[]);
    writeStatus(true, added === 0 ? "No new GD-worthy stories" : `Added ${added} new ${added === 1 ? "story" : "stories"}`);
  } catch (err) {
    console.error("GD prep scan failed:", err);
    writeStatus(false, "Couldn't check for new stories.");
  }
}

export type NoteResult = "ok" | "rateLimited" | "budget" | "failed";

const notesInFlight = new Map<string, Promise<NoteResult>>();

export function isGeneratingNote(id: string): boolean {
  return notesInFlight.has(id);
}

export function generateNoteFor(
  db: SqliteLocalDb,
  entry: { id: string; title: string; summary: string | null; source: string | null }
): Promise<NoteResult> {
  const existing = notesInFlight.get(entry.id);
  if (existing) return existing;
  if (budgetLeft() === 0) return Promise.resolve("budget");
  const run = (async (): Promise<NoteResult> => {
    spendBudget(); // every note request reaches Gemini
    try {
      const { data, error } = await supabase.functions.invoke("gd-prep", {
        body: { mode: "note", item: { title: entry.title, summary: entry.summary ?? "", source: entry.source ?? "" } },
      });
      if (error) throw error;
      if (data?.rateLimited) return "rateLimited";
      if (!data?.note) return "failed";
      await setNote(db, entry.id, data.note as PrepNote);
      return "ok";
    } catch (err) {
      console.error("GD prep note failed:", err);
      return "failed";
    }
  })().finally(() => {
    notesInFlight.delete(entry.id);
    notifyGdPrepChanged();
  });
  notesInFlight.set(entry.id, run);
  notifyGdPrepChanged();
  return run;
}

export function startGdPrepLoop(db: SqliteLocalDb): () => void {
  const tick = () => {
    if (scanIsDue()) void runGdPrepScan(db);
  };
  tick();
  const handle = setInterval(tick, TICK_MS);
  return () => clearInterval(handle);
}
