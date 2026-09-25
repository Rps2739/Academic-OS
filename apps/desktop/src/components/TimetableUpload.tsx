import { useRef, useState } from "react";
import { parseTimetableWorkbook, type ParseResult } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { supabase } from "../lib/supabase";
import { Upload, AlertTriangle, Check, CalendarDays } from "lucide-react";

interface TimetableUploadProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function groupByDay(sessions: ParseResult["sessions"]) {
  const groups = new Map<string, ParseResult["sessions"]>();
  for (const s of sessions) {
    const day = s.startsAt.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(s);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${DAY_NAMES[(d.getUTCDay() + 6) % 7]}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

function formatTime(iso: string): string {
  // Plain local-time display — startsAt/endsAt are genuine UTC (the
  // normalizer already converts from the sheet's IST times), so no
  // special-casing needed here, unlike formatDayLabel above which
  // deliberately works with a bare date string, not a real timestamp.
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Manual timetable upload (design manual §4.3) — parse -> preview ->
 * confirm. The heavier automated pipeline (§4.4, Gemini extraction +
 * Google Calendar sync) reads the college inbox unattended; this is the
 * always-available fallback and the thing this parser gets tested
 * against. A re-upload for a week that's already imported supersedes
 * the previous import's sessions rather than duplicating them —
 * handles the "revised mid-week" case the plan calls out explicitly.
 */
export function TimetableUpload({ localDb, userId, onChanged }: TimetableUploadProps) {
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [alreadyImported, setAlreadyImported] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    pendingFile.current = file;
    setParsing(true);
    setError(null);
    setResult(null);
    setConfirmed(false);
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);
      setChecksum(hash);

      const existing = await localDb.raw.select<{ id: string }[]>(
        "SELECT id FROM timetable_imports WHERE checksum = $1 AND deleted_at IS NULL",
        [hash]
      );
      setAlreadyImported(existing.length > 0);

      const parsed = parseTimetableWorkbook(buf);
      setResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirmImport() {
    if (!result || !checksum) return;
    setConfirming(true);
    setError(null);
    try {
      // An identical file (by checksum) already imported means there's
      // nothing new to record — without this check, re-confirming the
      // same file created a second import whose sessions never got
      // superseded by anything (the automated pipeline already guards
      // against this; this path didn't), silently doubling up every
      // session for that week in the widgets and Calendar.
      const existingImport = await localDb.raw.select<{ id: string }[]>(
        "SELECT id FROM timetable_imports WHERE user_id = $1 AND checksum = $2 AND deleted_at IS NULL",
        [userId, checksum]
      );
      if (existingImport.length > 0) {
        setConfirmed(true);
        setConfirming(false);
        return;
      }

      // Supersede the previous timetable's sessions for this week —
      // simple and correct for the desktop path; per-session diffing
      // (a precise "3 classes changed" notification) is the Edge
      // Function's job (§4.5), not this one. Timetable-sourced rows only
      // (import_id set): classes added by hand and events pulled from
      // Google Calendar survive a new timetable, since superseded
      // sessions get their Calendar events deleted.
      const previous = await localDb.raw.select<{ id: string }[]>(
        "SELECT id FROM class_sessions WHERE week_start = $1 AND status = 'scheduled' AND import_id IS NOT NULL AND deleted_at IS NULL",
        [result.weekStart]
      );
      for (const row of previous) {
        await localDb.put("class_sessions", { id: row.id, user_id: userId, status: "superseded" });
      }

      const importId = crypto.randomUUID();
      const file = pendingFile.current;

      // Best-effort — the import itself must succeed even if Drive is
      // unreachable. Keeps the original spreadsheet around for the
      // archive view's "download original" action.
      let driveFileId: string | null = null;
      if (file) {
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("filename", file.name);
          const { data, error: fnError } = await supabase.functions.invoke("drive-upload", {
            body: form,
          });
          if (!fnError) driveFileId = (data as { driveFileId: string }).driveFileId;
        } catch {
          // archive can still show the parsed sessions without the original file
        }
      }

      await localDb.put("timetable_imports", {
        id: importId,
        user_id: userId,
        source: "manual_upload",
        source_message_id: null,
        received_at: new Date().toISOString(),
        week_start: result.weekStart,
        raw: result.sessions,
        checksum,
        parsed_ok: result.warnings.length === 0,
        parse_error: null,
        superseded_by: null,
        drive_file_id: driveFileId,
        original_filename: file?.name ?? null,
      });

      for (const s of result.sessions) {
        await localDb.put("class_sessions", {
          id: crypto.randomUUID(),
          user_id: userId,
          import_id: importId,
          week_start: s.weekStart,
          starts_at: s.startsAt,
          ends_at: s.endsAt,
          subject_id: null, // resolved against subjects.aliases later, not here
          subject_label: s.subjectLabel,
          faculty: s.faculty,
          room: null,
          session_type: s.sessionType,
          status: "scheduled",
          gcal_event_id: null,
        });
      }

      setConfirmed(true);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  const grouped = result ? groupByDay(result.sessions) : [];

  return (
    <div className="timetable-upload">
      <div className="timetable-upload__header">
        <h1 className="timetable-upload__title">Timetable</h1>
        <button className="btn btn--secondary" disabled={parsing} onClick={() => fileInput.current?.click()}>
          {parsing && <span className="spinner" aria-hidden />}
          <Upload size={14} strokeWidth={2} />
          {parsing ? "Parsing…" : "Upload timetable"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => void handleFile(e.target.files)}
        />
      </div>

      {error && (
        <p className="timetable-upload__error">
          <AlertTriangle size={14} strokeWidth={2} />
          {error}
        </p>
      )}

      {!result && !parsing && (
        <p className="timetable-upload__empty">
          <CalendarDays size={28} strokeWidth={1.5} />
          Upload a timetable .xlsx to see this week's classes here.
        </p>
      )}

      {result && (
        <>
          <div className="timetable-upload__summary">
            <span>
              Week of <strong>{result.weekStart}</strong> — {result.sessions.length} session
              {result.sessions.length === 1 ? "" : "s"} found
            </span>
            {alreadyImported && (
              <span className="timetable-upload__badge timetable-upload__badge--warn">
                Already imported — confirming will re-supersede this week
              </span>
            )}
          </div>

          {result.warnings.length > 0 && (
            <ul className="timetable-upload__warnings">
              {result.warnings.map((w, i) => (
                <li key={i}>
                  <AlertTriangle size={12} strokeWidth={2} />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div className="timetable-upload__preview">
            {grouped.map(([day, sessions]) => (
              <div key={day} className="timetable-upload__day">
                <h3>{formatDayLabel(day)}</h3>
                <ul>
                  {sessions.map((s, i) => (
                    <li key={i}>
                      <span className="timetable-upload__time">
                        {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
                      </span>
                      <span className="timetable-upload__subject">{s.subjectLabel}</span>
                      {s.faculty && <span className="timetable-upload__faculty">{s.faculty}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {confirmed ? (
            <p className="timetable-upload__confirmed">
              <Check size={14} strokeWidth={2} />
              Imported — check the Today widget or the calendar view.
            </p>
          ) : (
            <button className="btn btn--primary" disabled={confirming} onClick={() => void confirmImport()}>
              {confirming && <span className="spinner" aria-hidden />}
              {confirming ? "Importing…" : "Confirm import"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
