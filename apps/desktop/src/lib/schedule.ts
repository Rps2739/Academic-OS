// Shared by the Classes widget and Home's schedule card, which both list
// class_sessions — timetable classes plus events pulled from the app's
// Google Calendar.

/** All-day Google events are stored as local-midnight-to-midnight spans. */
export function isAllDay(startsAt: string, endsAt: string): boolean {
  const start = new Date(startsAt);
  const hours = (new Date(endsAt).getTime() - start.getTime()) / 3_600_000;
  return start.getHours() === 0 && start.getMinutes() === 0 && hours >= 24 && hours % 24 === 0;
}

export function formatSessionTime(startsAt: string, endsAt: string): string {
  if (isAllDay(startsAt, endsAt)) return "All day";
  return new Date(startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatSessionDay(startsAt: string): string {
  return new Date(startsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// `date(starts_at)` alone returns the UTC calendar date — an event at local
// midnight (every all-day event) is still the previous day in UTC.
export const TODAY_SESSIONS_SQL = `SELECT * FROM class_sessions
  WHERE date(starts_at, 'localtime') = date('now', 'localtime')
    AND status NOT IN ('cancelled', 'superseded') AND deleted_at IS NULL
  ORDER BY starts_at ASC`;

/** Next 7 days after today — the user's own entries only (import_id IS
 * NULL: added by hand or pulled from Google Calendar), not every
 * timetable class, which would swamp a small widget. */
export const UPCOMING_EVENTS_SQL = `SELECT * FROM class_sessions
  WHERE date(starts_at, 'localtime') > date('now', 'localtime')
    AND date(starts_at, 'localtime') <= date('now', 'localtime', '+7 days')
    AND import_id IS NULL AND status = 'scheduled' AND deleted_at IS NULL
  ORDER BY starts_at ASC`;
