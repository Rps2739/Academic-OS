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

  var label = getOrCreateLabel_('AcademicOS-Processed');
  // subject:Timetable narrows out the unrelated .xlsx attachments
  // (scoresheets, CV drives, etc.) that a bare has:attachment search
  // also matched during testing.
  var threads = GmailApp.search('subject:Timetable has:attachment filename:xlsx -label:AcademicOS-Processed', 0, 20);
  Logger.log('Found ' + threads.length + ' unprocessed timetable thread(s)');

  threads.forEach(function (thread) {
    var allOk = true;
    thread.getMessages().forEach(function (message) {
      message.getAttachments().forEach(function (attachment) {
        if (!/\.xlsx?$/i.test(attachment.getName())) return;
        var ok = false;
        try {
          ok = ingestOne_(endpoint, secret, message, attachment);
          // A big backlog run (many unprocessed threads at once, e.g.
          // the first-ever run) fires one Gemini extraction per
          // attachment in a tight loop, which is exactly what tripped a
          // 503 "high demand" response against a fresh API key's
          // per-minute quota in practice. The Edge Function itself
          // already retries a single request with backoff; this spaces
          // the requests out so a big backlog doesn't cause that in the
          // first place. Ordinary hourly runs only see 0-1 new threads,
          // so this adds no real delay in steady state.
          Utilities.sleep(4000);
        } catch (err) {
          Logger.log('Ingest failed for ' + attachment.getName() + ': ' + err);
        }
        if (!ok) allOk = false;
      });
    });
    // Only mark a thread processed once every attachment in it actually
    // succeeded — labeling on failure would silently skip it forever,
    // since the search excludes labeled threads.
    if (allOk) {
      thread.addLabel(label);
    } else {
      Logger.log('Leaving "' + thread.getFirstMessageSubject() + '" unlabeled so it retries next run.');
    }
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
  var code = res.getResponseCode();
  var text = res.getContentText();
  Logger.log(attachment.getName() + ' -> ' + code + ' ' + text);
  if (code < 200 || code >= 300) return false;

  // The Edge Function deliberately still responds 200 when extraction
  // itself failed (e.g. a Gemini rate limit) — it records the attempt
  // rather than losing the file. Only "duplicate" or a clean "ok" with
  // no parseError counts as actually done; anything else should stay
  // unlabeled so the next hourly run retries it (cheap — the function
  // reuses the Drive upload and just re-calls Gemini for a checksum it
  // already has on file).
  try {
    var body = JSON.parse(text);
    return body.status === 'duplicate' || (body.status === 'ok' && !body.parseError);
  } catch (err) {
    return false;
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// One-off cleanup: run this once after a run that mislabeled threads
// despite failing (e.g. the platform-JWT 401 issue — see setup comment).
// Safe to run any time; it just makes checkAndIngestTimetables reconsider
// everything again on its next run.
function unlabelAllForRetry() {
  var label = GmailApp.getUserLabelByName('AcademicOS-Processed');
  if (!label) return;
  label.getThreads().forEach(function (t) { t.removeLabel(label); });
  Logger.log('Removed AcademicOS-Processed from all threads — next run will retry everything.');
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
