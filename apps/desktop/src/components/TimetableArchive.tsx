import { useEffect, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { supabase } from "../lib/supabase";
import { writeFile, mkdir, BaseDirectory } from "@tauri-apps/plugin-fs";
import { tempDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Download, Archive } from "lucide-react";

interface TimetableArchiveProps {
  localDb: SqliteLocalDb;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${DAY_NAMES[d.getDay()]}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function versionLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? "Original" : `Revision ${i}`));
}

/**
 * Excel-sheet-style browser for every timetable ever imported (design
 * manual §4.3 follow-up) — a week dropdown, and within a week every
 * version received (original + any mid-week revisions), each one's
 * sessions laid out as day columns. Revisions aren't deleted on
 * reimport (TimetableUpload marks the old sessions 'superseded' rather
 * than removing them), so every past version stays browsable here.
 */
export function TimetableArchive({ localDb }: TimetableArchiveProps) {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState<string | null>(null);
  const [imports, setImports] = useState<LocalRow[]>([]);
  const [importId, setImportId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LocalRow[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const rows = await localDb.raw.select<{ week_start: string }[]>(
        "SELECT DISTINCT week_start FROM timetable_imports WHERE deleted_at IS NULL ORDER BY week_start DESC"
      );
      const list = rows.map((r) => r.week_start);
      setWeeks(list);
      setWeek((current) => current ?? list[0] ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

  useEffect(() => {
    if (!week) {
      setImports([]);
      setImportId(null);
      return;
    }
    void (async () => {
      const rows = await localDb.raw.select<Record<string, unknown>[]>(
        "SELECT * FROM timetable_imports WHERE week_start = $1 AND deleted_at IS NULL ORDER BY received_at ASC",
        [week]
      );
      setImports(rows as LocalRow[]);
      setImportId((rows[rows.length - 1]?.id as string | undefined) ?? null);
    })();
  }, [localDb, week]);

  useEffect(() => {
    if (!importId) {
      setSessions([]);
      return;
    }
    void (async () => {
      const rows = await localDb.raw.select<Record<string, unknown>[]>(
        "SELECT * FROM class_sessions WHERE import_id = $1 AND deleted_at IS NULL ORDER BY starts_at ASC",
        [importId]
      );
      setSessions(rows as LocalRow[]);
    })();
  }, [localDb, importId]);

  const labels = versionLabels(imports.length);
  const selectedImport = imports.find((i) => (i.id as string) === importId) ?? null;

  const days = new Map<string, LocalRow[]>();
  for (const s of sessions) {
    const key = dayKey(s["starts_at"] as string);
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(s);
  }
  const dayColumns = [...days.entries()].sort(
    ([, a], [, b]) => new Date(a[0]["starts_at"] as string).getTime() - new Date(b[0]["starts_at"] as string).getTime()
  );

  async function downloadOriginal() {
    const driveFileId = selectedImport?.["drive_file_id"] as string | null | undefined;
    if (!driveFileId) return;
    setDownloading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/drive-fetch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driveFileId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const bytes = new Uint8Array(await res.arrayBuffer());
      const filename = (selectedImport?.["original_filename"] as string | null) ?? `${week}.xlsx`;
      const relativePath = `academicos/${importId}-${filename}`;
      await mkdir("academicos", { baseDir: BaseDirectory.Temp, recursive: true });
      await writeFile(relativePath, bytes, { baseDir: BaseDirectory.Temp });
      const fullPath = await join(await tempDir(), relativePath);
      await openPath(fullPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  if (weeks.length === 0) {
    return (
      <p className="timetable-upload__empty">
        <Archive size={28} strokeWidth={1.5} />
        No timetables imported yet.
      </p>
    );
  }

  return (
    <div className="timetable-archive">
      <div className="timetable-archive__controls">
        <select className="tt-select" value={week ?? ""} onChange={(e) => setWeek(e.target.value)}>
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week of {w}
            </option>
          ))}
        </select>
        <select className="tt-select" value={importId ?? ""} onChange={(e) => setImportId(e.target.value)}>
          {imports.map((imp, i) => (
            <option key={imp.id as string} value={imp.id as string}>
              {labels[i]} — received {new Date(imp["received_at"] as string).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </option>
          ))}
        </select>
        {selectedImport?.["drive_file_id"] ? (
          <button className="btn btn--secondary" disabled={downloading} onClick={() => void downloadOriginal()}>
            {downloading && <span className="spinner" aria-hidden />}
            <Download size={14} strokeWidth={2} />
            {downloading ? "Opening…" : "Original file"}
          </button>
        ) : null}
      </div>

      {error && <p className="timetable-upload__error">{error}</p>}

      {dayColumns.length === 0 ? (
        <p className="timetable-upload__empty">No sessions recorded for this version.</p>
      ) : (
        <div className="timetable-archive__grid">
          {dayColumns.map(([key, daySessions]) => (
            <div key={key} className="timetable-archive__col">
              <h3>{dayLabel(daySessions[0]["starts_at"] as string)}</h3>
              <div className="timetable-archive__cells">
                {daySessions.map((s) => (
                  <div key={s.id as string} className="timetable-archive__cell">
                    <span className="timetable-archive__cell-time">
                      {formatTime(s["starts_at"] as string)}–{formatTime(s["ends_at"] as string)}
                    </span>
                    <span className="timetable-archive__cell-subject">{s["subject_label"] as string}</span>
                    {s["faculty"] ? <span className="timetable-archive__cell-faculty">{s["faculty"] as string}</span> : null}
                    {(s["status"] as string) === "superseded" && (
                      <span className="timetable-archive__cell-superseded">Superseded</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
