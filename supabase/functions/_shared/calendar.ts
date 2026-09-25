// Two-way sync between class_sessions and the app's own dedicated Google
// Calendar ("Academic OS — Classes", design manual §4.6-§4.8). Shared by
// gcal-sync (the desktop app's periodic loop, JWT-authenticated) and
// timetable-ingest (calls this right after creating sessions,
// service-role-authenticated) so Calendar stays current even when the
// desktop app isn't running.
//
// Originally push-only. Now two-way, at the user's request, but scoped to
// THIS calendar only (never their primary/other calendars): an event the
// user adds or edits there in Google Calendar becomes/updates a
// class_sessions row, so it shows in the Classes widget and Home; an edit
// or delete made in the app is written back to Google.
//
// PULL RUNS BEFORE PUSH — same lesson as gtasks-sync: pushing first from a
// not-yet-reconciled Postgres state overwrites a fresher change made on
// the phone. Pull mutates the in-memory rows push then reads.
//
// Loop-safety: every write in either direction is gated on the VALUES
// actually differing, not just on timestamps. Postgres's updated_at
// trigger bumps the row's timestamp on every write (including the pull's
// own), so a timestamp-only rule would PATCH the same values back to
// Google, whose new `updated` would then look newer than the row, and so
// on forever, every round.
//
// Deletions are never inferred from an event being ABSENT from a listing
// (the class of bug that once mass-deleted tasks in gtasks-sync) — only
// from Google explicitly reporting status "cancelled" (showDeleted=true).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_NAME = "Academic OS — Classes";
const PULL_PAST_DAYS = 7;
const PULL_FUTURE_DAYS = 60;
const CLOCK_SKEW_MS = 5000;
// Tags events this app created, so a pull racing a concurrent create (e.g.
// timetable-ingest writing an event before it's saved the row's
// gcal_event_id) doesn't re-import the app's own event as a duplicate.
const OWNER_PROP = "academicOsSessionId";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

async function getOrCreateCalendarId(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string
): Promise<string> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("gcal_calendar_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (settings?.gcal_calendar_id) return settings.gcal_calendar_id as string;

  const res = await fetch(`${CALENDAR_API}/calendars`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: CALENDAR_NAME, timeZone: "Asia/Kolkata" }),
  });
  if (!res.ok) throw new Error(`Failed to create Calendar: ${await res.text()}`);
  const calendar = await res.json();
  const calendarId = calendar.id as string;

  // user_settings has no row yet for a brand-new user, so upsert rather
  // than update — everything else on this row (timezone default, etc.)
  // is fine to leave at its column default when created this way.
  await supabase.from("user_settings").upsert({ user_id: userId, gcal_calendar_id: calendarId });
  return calendarId;
}

interface SessionRow {
  id: string;
  starts_at: string;
  ends_at: string;
  subject_label: string;
  faculty: string | null;
  room: string | null;
  session_type: string | null;
  status: string;
  deleted_at: string | null;
  updated_at: string;
  gcal_event_id: string | null;
}

interface GEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  location?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/** Timetable classes are titled "TM (AG) — Session 20" in Calendar. */
function summaryFor(s: Pick<SessionRow, "subject_label" | "session_type">): string {
  return s.session_type ? `${s.subject_label} — ${s.session_type}` : s.subject_label;
}

/** Inverse of summaryFor: keep the session-number suffix out of the label
 * unless the user renamed the event into something else entirely. */
function labelFromSummary(summary: string, sessionType: string | null): string {
  const suffix = sessionType ? ` — ${sessionType}` : null;
  return suffix && summary.endsWith(suffix) ? summary.slice(0, -suffix.length) : summary;
}

/** All-day events carry a bare date; anchor them to IST midnight (this
 * calendar is created in Asia/Kolkata). The end date is exclusive. */
function eventInstant(point: GEvent["start"]): string | null {
  if (point?.dateTime) return new Date(point.dateTime).toISOString();
  if (point?.date) return new Date(`${point.date}T00:00:00+05:30`).toISOString();
  return null;
}

function mondayOfIst(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function sameInstant(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && Date.parse(a) === Date.parse(b);
}

async function listEvents(eventsUrl: string, gHeaders: Record<string, string>): Promise<GEvent[] | null> {
  const timeMin = new Date(Date.now() - PULL_PAST_DAYS * 86400000).toISOString();
  const timeMax = new Date(Date.now() + PULL_FUTURE_DAYS * 86400000).toISOString();
  const events: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true", // expand recurring events into their own instances
      showDeleted: "true", // deletions come back as status "cancelled"
      maxResults: "2500",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${eventsUrl}?${params}`, { headers: gHeaders });
    if (!res.ok) {
      console.error("Calendar pull skipped this round:", await res.text());
      return null;
    }
    const page = (await res.json()) as { items?: GEvent[]; nextPageToken?: string };
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

export async function syncClassSessionsToCalendar(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string
): Promise<{ created: number; removed: number; pulled: number; updated: number }> {
  const calendarId = await getOrCreateCalendarId(supabase, userId, accessToken);
  const gHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const eventsUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;

  let created = 0;
  let removed = 0;
  let pulled = 0;
  let updated = 0;

  // --- 1. Pull: Google -> class_sessions ---------------------------------
  const events = await listEvents(eventsUrl, gHeaders);
  const liveEventById = new Map<string, GEvent>();

  const { data: linkedRows } = await supabase
    .from("class_sessions")
    .select("id, starts_at, ends_at, subject_label, faculty, room, session_type, status, deleted_at, updated_at, gcal_event_id")
    .eq("user_id", userId)
    .not("gcal_event_id", "is", null);
  const sessionByEventId = new Map(((linkedRows ?? []) as SessionRow[]).map((s) => [s.gcal_event_id as string, s]));

  for (const event of events ?? []) {
    const session = sessionByEventId.get(event.id);

    if (event.status === "cancelled") {
      // Deleted in Google Calendar -> remove it from the app too.
      if (session && !session.deleted_at) {
        const now = new Date().toISOString();
        await supabase.from("class_sessions").update({ deleted_at: now, gcal_event_id: null }).eq("id", session.id);
        session.deleted_at = now;
        session.gcal_event_id = null;
        pulled++;
      }
      continue;
    }

    liveEventById.set(event.id, event);
    const startsAt = eventInstant(event.start);
    const endsAt = eventInstant(event.end);
    if (!startsAt || !endsAt) continue;

    if (!session) {
      // Created by this app but its row hasn't recorded the event id yet —
      // the push that created it will finish linking it. Not new.
      if (event.extendedProperties?.private?.[OWNER_PROP]) continue;
      const { error } = await supabase.from("class_sessions").insert({
        user_id: userId,
        import_id: null, // not from a timetable — so a timetable revision never supersedes it
        week_start: mondayOfIst(startsAt),
        starts_at: startsAt,
        ends_at: endsAt,
        subject_id: null,
        subject_label: event.summary?.trim() || "(No title)",
        faculty: null,
        room: event.location ?? null,
        session_type: null, // null keeps it out of Subjects' "sync from timetable" discovery
        status: "scheduled",
        gcal_event_id: event.id,
      });
      if (!error) pulled++;
      continue;
    }

    if (session.deleted_at || session.status !== "scheduled") continue; // push below deletes it from Google

    const googleUpdated = event.updated ? Date.parse(event.updated) : 0;
    if (googleUpdated <= Date.parse(session.updated_at) + CLOCK_SKEW_MS) continue;

    const next = {
      subject_label: labelFromSummary(event.summary?.trim() || "(No title)", session.session_type),
      room: event.location ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
    };
    const differs =
      next.subject_label !== session.subject_label ||
      next.room !== session.room ||
      !sameInstant(next.starts_at, session.starts_at) ||
      !sameInstant(next.ends_at, session.ends_at);
    if (!differs) continue;

    await supabase.from("class_sessions").update(next).eq("id", session.id);
    Object.assign(session, next, { updated_at: new Date().toISOString() });
    pulled++;
  }

  // --- 2. Push deletions: app -> Google ----------------------------------
  // Two separate queries rather than one combined OR filter — easier to
  // read, and processing the rare row that satisfies both twice is
  // harmless (the second delete just gets a 404/410, still handled below).
  const { data: deletedRows } = await supabase
    .from("class_sessions")
    .select("id, gcal_event_id")
    .eq("user_id", userId)
    .not("gcal_event_id", "is", null)
    .not("deleted_at", "is", null);
  const { data: supersededRows } = await supabase
    .from("class_sessions")
    .select("id, gcal_event_id")
    .eq("user_id", userId)
    .not("gcal_event_id", "is", null)
    .is("deleted_at", null)
    .in("status", ["superseded", "cancelled"]);

  for (const row of [...(deletedRows ?? []), ...(supersededRows ?? [])]) {
    const res = await fetch(`${eventsUrl}/${row.gcal_event_id}`, { method: "DELETE", headers: gHeaders });
    // 404/410 both mean it's already gone from Calendar — fine either way.
    if (res.ok || res.status === 404 || res.status === 410) {
      await supabase.from("class_sessions").update({ gcal_event_id: null }).eq("id", row.id);
      removed++;
    }
  }

  // --- 3. Push edits: app -> Google --------------------------------------
  // Only for events actually seen live in this round's pull (we know their
  // current Google state), and only when the app's copy is both different
  // and newer — an edit made in the widget (time, title, room).
  for (const session of sessionByEventId.values()) {
    if (session.deleted_at || session.status !== "scheduled" || !session.gcal_event_id) continue;
    const event = liveEventById.get(session.gcal_event_id);
    if (!event) continue;
    const googleUpdated = event.updated ? Date.parse(event.updated) : 0;
    if (Date.parse(session.updated_at) <= googleUpdated + CLOCK_SKEW_MS) continue;

    const patch: Record<string, unknown> = {};
    if (summaryFor(session) !== (event.summary ?? "")) patch.summary = summaryFor(session);
    if ((session.room ?? null) !== (event.location ?? null)) patch.location = session.room ?? "";
    // Only touch start/end when the time really changed, so an all-day
    // event whose title was edited in the app stays all-day.
    if (!sameInstant(session.starts_at, eventInstant(event.start)) || !sameInstant(session.ends_at, eventInstant(event.end))) {
      patch.start = { dateTime: session.starts_at };
      patch.end = { dateTime: session.ends_at };
    }
    if (Object.keys(patch).length === 0) continue;

    const res = await fetch(`${eventsUrl}/${session.gcal_event_id}`, {
      method: "PATCH",
      headers: gHeaders,
      body: JSON.stringify(patch),
    });
    if (res.ok) updated++;
    else console.error(`Failed to update Calendar event for session ${session.id}:`, await res.text());
  }

  // --- 4. Push creations: app -> Google ----------------------------------
  const { data: toCreate } = await supabase
    .from("class_sessions")
    .select("id, starts_at, ends_at, subject_label, faculty, room, session_type")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .is("deleted_at", null)
    .is("gcal_event_id", null);

  for (const s of (toCreate ?? []) as SessionRow[]) {
    const res = await fetch(eventsUrl, {
      method: "POST",
      headers: gHeaders,
      body: JSON.stringify({
        summary: summaryFor(s),
        location: s.room ?? undefined,
        description: s.faculty ?? undefined,
        // starts_at/ends_at are already genuine UTC (see normalize.ts's
        // and _shared/gemini.ts's IST->UTC conversion) — passed through
        // as-is, no timezone field needed; Google Calendar displays any
        // RFC3339 instant in the viewer's own timezone automatically.
        start: { dateTime: s.starts_at },
        end: { dateTime: s.ends_at },
        extendedProperties: { private: { [OWNER_PROP]: s.id } },
      }),
    });
    if (!res.ok) throw new Error(`Failed to create Calendar event for session ${s.id}: ${await res.text()}`);
    const event = await res.json();
    await supabase.from("class_sessions").update({ gcal_event_id: event.id }).eq("id", s.id);
    created++;
  }

  return { created, removed, pulled, updated };
}
