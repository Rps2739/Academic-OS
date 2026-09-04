// Pushes class_sessions into a dedicated Google Calendar (design manual
// §4.6-§4.8). One-directional (class_sessions -> Calendar) rather than
// two-way like gtasks-sync: a class's schedule is owned by the
// timetable, not by editing an event on a phone, so there's nothing
// meaningful to pull back. Shared by gcal-sync (the desktop app's
// periodic loop, JWT-authenticated) and timetable-ingest (calls this
// directly after creating sessions, service-role-authenticated) so the
// automated pipeline reflects into Calendar even when the desktop app
// isn't running.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_NAME = "Academic OS — Classes";

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
}

export async function syncClassSessionsToCalendar(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string
): Promise<{ created: number; removed: number }> {
  const calendarId = await getOrCreateCalendarId(supabase, userId, accessToken);
  const gHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const eventsUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;

  let created = 0;
  let removed = 0;

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

  const { data: toCreate } = await supabase
    .from("class_sessions")
    .select("id, starts_at, ends_at, subject_label, faculty, room, session_type")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .is("deleted_at", null)
    .is("gcal_event_id", null);

  for (const s of (toCreate ?? []) as SessionRow[]) {
    const summary = s.session_type ? `${s.subject_label} — ${s.session_type}` : s.subject_label;
    const res = await fetch(eventsUrl, {
      method: "POST",
      headers: gHeaders,
      body: JSON.stringify({
        summary,
        location: s.room ?? undefined,
        description: s.faculty ?? undefined,
        // starts_at/ends_at are already genuine UTC (see normalize.ts's
        // and _shared/gemini.ts's IST->UTC conversion) — passed through
        // as-is, no timezone field needed; Google Calendar displays any
        // RFC3339 instant in the viewer's own timezone automatically.
        start: { dateTime: s.starts_at },
        end: { dateTime: s.ends_at },
      }),
    });
    if (!res.ok) throw new Error(`Failed to create Calendar event for session ${s.id}: ${await res.text()}`);
    const event = await res.json();
    await supabase.from("class_sessions").update({ gcal_event_id: event.id }).eq("id", s.id);
    created++;
  }

  return { created, removed };
}
