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
  const [tab, setTab] = useState<"upload" | "archive">("upload");
  const [archiveKey, setArchiveKey] = useState(0);

  return (
    <div className={`timetable-view ${tab === "archive" ? "timetable-view--archive" : ""}`}>
      <div className="timetable-view__tabs">
        <button
          className={`timetable-view__tab ${tab === "upload" ? "timetable-view__tab--active" : ""}`}
          onClick={() => setTab("upload")}
        >
          Upload
        </button>
        <button
          className={`timetable-view__tab ${tab === "archive" ? "timetable-view__tab--active" : ""}`}
          onClick={() => setTab("archive")}
        >
          Browse archive
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
