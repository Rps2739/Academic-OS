// Apps Script watcher for the SIBM college Gmail inbox (design manual
// §4.4-§4.5). This file is NOT built or deployed by this repo's tooling
// — it's a reference copy of what should be pasted into the Apps Script
// project in the user's college Google Workspace account
// (script.google.com, the same project the testOutbound/
// testGmailAndFindTimetables feasibility test lives in). Keep this file
// and the live script in sync by hand.
//
// One-time setup in the Apps Script editor:
//   1. Project Settings (gear icon) -> Script Properties -> add:
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
    thread.getMessages().forEach(function (message) {
      message.getAttachments().forEach(function (attachment) {
        if (!/\.xlsx?$/i.test(attachment.getName())) return;
        try {
          ingestOne_(endpoint, secret, message, attachment);
        } catch (err) {
          Logger.log('Ingest failed for ' + attachment.getName() + ': ' + err);
        }
      });
    });
    thread.addLabel(label);
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

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
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
