// Receives a timetable email attachment from the Apps Script watcher
// running on the user's SIBM college Gmail (design manual §4.4-§4.5) and
// turns it into the same timetable_imports/class_sessions rows the
// manual upload flow creates (see TimetableUpload.tsx).
//
// Auth is deliberately not a Supabase session JWT: Apps Script has no
// interactive login to this app, so there's no user session to forward.
// Instead the watcher sends a static shared secret (INGEST_SHARED_SECRET,
// set once via `supabase secrets set` and pasted into the script's own
// Script Properties — never into the script body) and this function uses
// the service-role key to write on behalf of the app's one owner. That's
// only acceptable because this is a genuinely single-user app; a
// multi-tenant version would need real per-user auth here instead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import { getGoogleAccessToken } from "../_shared/google-oauth.ts";
import { uploadFileToDrive } from "../_shared/drive.ts";
import { extractTimetableWithGemini, toUtcIso } from "../_shared/gemini.ts";
import { syncClassSessionsToCalendar } from "../_shared/calendar.ts";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One String.fromCharCode call per byte was cheap-looking but expensive
// enough on a larger .xlsx to trip Supabase's per-invocation CPU limit
// (WORKER_RESOURCE_LIMIT) in practice — chunking amortizes the call
// overhead across many bytes at once instead.
function toBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sharedSecret = Deno.env.get("INGEST_SHARED_SECRET");
  if (!sharedSecret || req.headers.get("x-ingest-secret") !== sharedSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const filename = form.get("filename");
    const receivedAt = form.get("receivedAt");
    const sourceMessageId = form.get("sourceMessageId");
    if (!(file instanceof File) || typeof filename !== "string" || typeof receivedAt !== "string") {
      return new Response(JSON.stringify({ error: "file, filename, and receivedAt are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Single-user app — there's exactly one owner, so no per-request
    // identity to resolve beyond "the only user that exists".
    const {
      data: { users },
      error: usersErr,
    } = await supabase.auth.admin.listUsers();
    if (usersErr || !users?.[0]) {
      throw new Error(`Could not resolve the app owner: ${usersErr?.message ?? "no users found"}`);
    }
    const userId = users[0].id;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const checksum = await sha256Hex(bytes);

    // Idempotency: the watcher may see the same email again (retry, or a
    // re-run before its processed-label sticks). A prior import with
    // this exact checksum that already parsed successfully means there's
    // nothing new to do — but one that previously *failed* to parse
    // (a bad Gemini response, a since-fixed bug) should be retried, not
    // treated as done forever just because the file itself is unchanged.
    const { data: existing } = await supabase
      .from("timetable_imports")
      .select("id, parsed_ok, drive_file_id")
      .eq("user_id", userId)
      .eq("checksum", checksum)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.parsed_ok) {
      return new Response(JSON.stringify({ status: "duplicate", importId: existing.id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Reuse the prior Drive upload on a retry instead of uploading the
    // same bytes to Drive again.
    let driveFileId = existing?.drive_file_id ?? null;
    if (!driveFileId) {
      const accessToken = await getGoogleAccessToken();
      driveFileId = await uploadFileToDrive(accessToken, filename, file.type, bytes);
    }

    let weekStart: string | null = null;
    let sessions: { startsAt: string; endsAt: string; subjectLabel: string; faculty: string | null; sessionType: string | null }[] = [];
    let parseError: string | null = null;
    try {
      const extracted = await extractTimetableWithGemini(toBase64(bytes), file.type || "application/octet-stream", Deno.env.get("GEMINI_API_KEY")!);
      weekStart = extracted.weekStart;
      sessions = extracted.sessions.map((s) => ({
        startsAt: toUtcIso(extracted.weekStart, s.day, s.startTime),
        endsAt: toUtcIso(extracted.weekStart, s.day, s.endTime),
        subjectLabel: s.subjectLabel,
        faculty: s.faculty ?? null,
        sessionType: s.sessionType ?? null,
      }));
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    // Record the import even on extraction failure — the file is safely
    // in Drive and visible in the archive view either way, and
    // parse_error surfaces why sessions are empty rather than the import
    // silently vanishing. A retry of a previously-failed checksum updates
    // that same row rather than inserting a duplicate.
    const importId = existing?.id ?? crypto.randomUUID();
    const importRow = {
      id: importId,
      user_id: userId,
      source: "apps_script",
      source_message_id: typeof sourceMessageId === "string" ? sourceMessageId : null,
      received_at: receivedAt,
      // Falls back to the email's own date (not "now") when extraction
      // fails entirely — best guess at which week this belongs under in
      // the archive view without a real weekStart to anchor on.
      week_start: weekStart ?? receivedAt.slice(0, 10),
      raw: sessions,
      checksum,
      parsed_ok: parseError === null,
      parse_error: parseError,
      drive_file_id: driveFileId,
      original_filename: filename,
    };
    const { error: importErr } = existing
      ? await supabase.from("timetable_imports").update(importRow).eq("id", importId)
      : await supabase.from("timetable_imports").insert(importRow);
    if (importErr) throw new Error(`Failed to record import: ${importErr.message}`);

    if (weekStart && sessions.length > 0) {
      // Same "supersede, don't delete" rule as the manual upload flow —
      // keeps prior versions of the week browsable in the archive view.
      // Only sessions that came from a timetable (import_id set): a
      // revision must not supersede classes added by hand or events
      // pulled from Google Calendar — superseded sessions get their
      // Calendar events DELETED, which would wipe the user's own events.
      const { data: previous } = await supabase
        .from("class_sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .eq("status", "scheduled")
        .not("import_id", "is", null)
        .is("deleted_at", null);
      for (const row of previous ?? []) {
        await supabase.from("class_sessions").update({ status: "superseded" }).eq("id", row.id);
      }

      const { error: sessionsErr } = await supabase.from("class_sessions").insert(
        sessions.map((s) => ({
          id: crypto.randomUUID(),
          user_id: userId,
          import_id: importId,
          week_start: weekStart,
          starts_at: s.startsAt,
          ends_at: s.endsAt,
          subject_id: null,
          subject_label: s.subjectLabel,
          faculty: s.faculty,
          room: null,
          session_type: s.sessionType,
          status: "scheduled",
          gcal_event_id: null,
        }))
      );
      if (sessionsErr) throw new Error(`Failed to record sessions: ${sessionsErr.message}`);

      // Best-effort, same as the Drive upload — the import itself has
      // already succeeded and must not be undone by a Calendar hiccup.
      // This is what makes new sessions show up in Calendar without the
      // desktop app needing to be open (gcal-sync only runs while it is;
      // if the app happens to be closed when the hourly watcher runs, this
      // is the ONLY thing that reaches the phone/other devices promptly).
      // A couple of retries here is safe to repeat blindly:
      // syncClassSessionsToCalendar is idempotent — it only creates events
      // for sessions still missing a gcal_event_id and only deletes ones
      // it can see are cancelled/superseded, so re-running after a partial
      // failure just picks up where it left off rather than double-booking.
      let calendarSynced = false;
      let lastCalendarErr: unknown;
      for (let attempt = 1; attempt <= 3 && !calendarSynced; attempt++) {
        try {
          // Fetched fresh rather than reusing the Drive-upload token above
          // — that one is scoped to the `if (!driveFileId)` branch and
          // may not have run this call (a retry reusing an existing
          // driveFileId skips it entirely). Access tokens are cheap and
          // short-lived by design, so no reason to thread it through.
          const calendarAccessToken = await getGoogleAccessToken();
          await syncClassSessionsToCalendar(supabase, userId, calendarAccessToken);
          calendarSynced = true;
        } catch (err) {
          lastCalendarErr = err;
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
      }
      if (!calendarSynced) {
        console.error("Calendar sync failed after ingest (3 attempts):", lastCalendarErr);
      }
    }

    return new Response(
      JSON.stringify({ status: "ok", importId, sessionCount: sessions.length, parseError }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
