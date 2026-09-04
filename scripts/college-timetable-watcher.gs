// Apps Script watcher for the SIBM college Gmail inbox (design manual
// §4.4-§4.5). This file is NOT built or deployed by this repo's tooling
// — it's a reference copy of what should be pasted into the Apps Script
// project in the user's college Google Workspace account
// (script.google.com, the same project the testOutbound/
// testGmailAndFindTimetables feasibility test lives in). Keep this file
// and the live script in sync by hand.
//
// One-time setup:
//   0. Deploy the Edge Function with --no-verify-jwt:
//        npx supabase functions deploy timetable-ingest --no-verify-jwt
//      Supabase puts a platform-level "require a Supabase session JWT"
//      gate in front of every Edge Function by default. Apps Script has
//      no session to send — it authenticates with the x-ingest-secret
//      header instead, checked inside the function itself — so without
//      --no-verify-jwt the platform rejects the request before our code
//      ever runs (shows up as a 401 UNAUTHORIZED_NO_AUTH_HEADER, not our
//      own {"error":"unauthorized"} shape). Don't add this flag to any
//      *other* function (drive-upload, drive-fetch, gtasks-sync) — those
//      are called from the browser app with a real session JWT and
//      should keep the platform check on.
//   1. In the Apps Script editor: Project Settings (gear icon) -> Script
//      Properties -> add:
//        EDGE_FUNCTION_URL      = https://<your-project-ref>.supabase.co/functions/v1/timetable-ingest
//        INGEST_SHARED_SECRET   = <the value you set via `supabase secrets set INGEST_SHARED_SECRET=...`>
//   2. Run installWatcherTrigger() once (Run button, with it selected in
//      the function dropdown) to install the recurring trigger. Grant
//      whatever permissions it asks for (Gmail read, external requests).
//   3. Delete the old testOutbound trigger (Triggers/clock icon in the
//      left sidebar) — it's no longer needed now that this replaces it.

function checkAndIngestTimetables() {
  var props = PropertiesService.getScriptProperties();
  var endpoint = props.getProperty('EDGE_FUNCTION_URL');
  var secret = props.getProperty('INGEST_SHARED_SECRET');
  if (!endpoint || !secret) {
    Logger.log('Missing EDGE_FUNCTION_URL or INGEST_SHARED_SECRET script property — see setup comment at the top of this file.');
    return;
  }

  // subject:Timetable narrows out the unrelated .xlsx attachments
  // (scoresheets, CV drives, etc.) that a bare has:attachment search
  // also matched during testing. after: a rolling 10-day window keeps
  // this scoped to "this week and every week from now on" — without it,
  // the very first run swept up the entire semester's backlog of old
  // timetable emails in one go and blew through the Gemini free tier's
  // daily quota.
  //
  // Deliberately no -label:/already-processed exclusion here: an
  // earlier version marked whole THREADS processed and skipped them on
  // future scans, which silently misses a mid-week revision sent as a
  // REPLY within an already-seen thread (this college does exactly
  // that — "kindly ignore previous mail" replies in the same thread,
  // observed directly in this inbox). Re-scanning the same handful of
  // threads every hour is cheap and correct instead: timetable-ingest's
  // own checksum check makes re-seeing an already-ingested attachment a
  // fast no-op ({"status":"duplicate"}), not a wasted Gemini call.
  var threads = GmailApp.search(
    'subject:Timetable has:attachment filename:xlsx after:' + searchWindowStart_(),
    0,
    20
  );
  Logger.log('Scanning ' + threads.length + ' timetable thread(s) from the last 10 days');

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      message.getAttachments().forEach(function (attachment) {
        if (!/\.xlsx?$/i.test(attachment.getName())) return;
        try {
          ingestOne_(endpoint, secret, message, attachment);
          // Pacing in case more than one attachment needs a real (non-
          // duplicate) ingest in the same run — see gemini.ts's own
          // retry-with-backoff for why a burst matters.
          Utilities.sleep(4000);
        } catch (err) {
          Logger.log('Ingest failed for ' + attachment.getName() + ': ' + err);
        }
      });
    });
  });
}

function ingestOne_(endpoint, secret, message, attachment) {
  // UrlFetchApp auto-builds a multipart/form-data request whenever the
  // payload object contains a Blob — no manual boundary handling needed.
  var payload = {
    file: attachment.copyBlob(),
    filename: attachment.getName(),
    receivedAt: message.getDate().toISOString(),
    sourceMessageId: message.getId(),
  };
  var res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    payload: payload,
    headers: { 'x-ingest-secret': secret },
    muteHttpExceptions: true,
  });
  Logger.log(attachment.getName() + ' -> ' + res.getResponseCode() + ' ' + res.getContentText());
}

function searchWindowStart_() {
  var d = new Date();
  d.setDate(d.getDate() - 10);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

// Run this once to (re)install the recurring watcher trigger. Safe to
// re-run — it clears any prior trigger for this function first, so it
// won't stack duplicates.
function installWatcherTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkAndIngestTimetables') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndIngestTimetables').timeBased().everyHours(1).create();
  Logger.log('Watcher trigger installed (hourly).');
}
