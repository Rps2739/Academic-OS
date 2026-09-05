import { useState } from "react";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { TimetableUpload } from "./TimetableUpload";
import { TimetableArchive } from "./TimetableArchive";

interface TimetableViewProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
}

export function TimetableView({ localDb, userId, onChanged }: TimetableViewProps) {
  // Archive is what you actually check day-to-day ("what classes do I
  // have this week") — Upload is an occasional action. Defaulting to
  // Upload made the thing people look at most feel buried; archive is
  // now both the default tab and listed first.
  const [tab, setTab] = useState<"upload" | "archive">("archive");
  const [archiveKey, setArchiveKey] = useState(0);

  return (
    <div className={`timetable-view ${tab === "archive" ? "timetable-view--archive" : ""}`}>
      <div className="timetable-view__tabs">
        <button
          className={`timetable-view__tab ${tab === "archive" ? "timetable-view__tab--active" : ""}`}
          onClick={() => setTab("archive")}
        >
          Browse archive
        </button>
        <button
          className={`timetable-view__tab ${tab === "upload" ? "timetable-view__tab--active" : ""}`}
          onClick={() => setTab("upload")}
        >
          Upload
        </button>
      </div>
      {tab === "upload" ? (
        <TimetableUpload
          localDb={localDb}
          userId={userId}
          onChanged={() => {
            onChanged();
            setArchiveKey((k) => k + 1);
          }}
        />
      ) : (
        <TimetableArchive key={archiveKey} localDb={localDb} />
      )}
    </div>
  );
}
