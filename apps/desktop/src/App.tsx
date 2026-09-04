import { useEffect, useRef, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import { FileText, NotebookText, ListTodo, CalendarDays } from "lucide-react";
import { AuthGate } from "./components/AuthGate";
import { TreeSidebar } from "./components/TreeSidebar";
import { PageEditor } from "./components/PageEditor";
import { AttachmentsRail } from "./components/AttachmentsRail";
import { TaskList } from "./components/TaskList";
import { TimetableView } from "./components/TimetableView";
import { SqliteLocalDb } from "./lib/sqlite-local-db";
import { createSyncController } from "./lib/sync-loop";
import { createGTasksSyncController } from "./lib/gtasks-sync-loop";
import { enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import "./App.css";

type View = "notes" | "tasks" | "timetable";

function MainLayout({ userId }: { userId: string }) {
  const [localDb, setLocalDb] = useState<SqliteLocalDb | null>(null);
  const [selected, setSelected] = useState<LocalRow | null>(null);
  const [view, setView] = useState<View>("notes");
  const [refreshTick, setRefreshTick] = useState(0);
  const startedRef = useRef(false);
  const syncRef = useRef<ReturnType<typeof createSyncController> | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void SqliteLocalDb.open().then(async (db) => {
      setLocalDb(db);
      const deviceId = await db.getOrCreateDeviceId();
      const controller = createSyncController(db, deviceId);
      syncRef.current = controller;
      controller.start();

      // Google Tasks sync writes straight to Postgres; this just makes
      // sure the local mirror picks it up promptly instead of waiting
      // for the main sync loop's own next interval.
      const gtasks = createGTasksSyncController(() => controller.triggerSync());
      gtasks.start();
    });

    // The app is meant to always be running (it's what keeps the desktop
    // widgets and the Ctrl+Alt+N capture shortcut alive) — enable
    // launch-at-login once rather than asking the user to find a setting.
    void isAutostartEnabled().then((already) => {
      if (!already) void enableAutostart();
    });
  }, []);

  function triggerSync() {
    syncRef.current?.triggerSync();
    setRefreshTick((t) => t + 1);
  }

  if (!localDb) {
    return (
      <div className="app-loading">
        <span className="spinner" aria-hidden /> Starting local database…
      </div>
    );
  }

  return (
    <div className="app-layout">
      <nav className="nav-rail">
        <button
          className={`nav-rail__item ${view === "notes" ? "nav-rail__item--active" : ""}`}
          title="Notes"
          onClick={() => setView("notes")}
        >
          <NotebookText size={19} strokeWidth={1.75} />
        </button>
        <button
          className={`nav-rail__item ${view === "tasks" ? "nav-rail__item--active" : ""}`}
          title="Tasks"
          onClick={() => setView("tasks")}
        >
          <ListTodo size={19} strokeWidth={1.75} />
        </button>
        <button
          className={`nav-rail__item ${view === "timetable" ? "nav-rail__item--active" : ""}`}
          title="Timetable"
          onClick={() => setView("timetable")}
        >
          <CalendarDays size={19} strokeWidth={1.75} />
        </button>
      </nav>
      {view === "notes" ? (
        <>
          <TreeSidebar
            localDb={localDb}
            userId={userId}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onChanged={triggerSync}
            refreshSignal={refreshTick}
          />
          <main className="app-main">
            {selected ? (
              <>
                {selected["kind"] === "page" ? (
                  <PageEditor localDb={localDb} userId={userId} node={selected} onSaved={triggerSync} />
                ) : (
                  <h2 className="page-editor__title">{selected["title"] as string}</h2>
                )}
                <AttachmentsRail localDb={localDb} userId={userId} node={selected} onChanged={triggerSync} />
              </>
            ) : (
              <div className="app-main__empty">
                <FileText size={28} strokeWidth={1.5} />
                <span>Select a page, or create one from the sidebar.</span>
              </div>
            )}
          </main>
        </>
      ) : view === "tasks" ? (
        <main className="app-main app-main--tasks">
          <TaskList localDb={localDb} userId={userId} onChanged={triggerSync} />
        </main>
      ) : (
        <main className="app-main app-main--timetable">
          <TimetableView localDb={localDb} userId={userId} onChanged={triggerSync} />
        </main>
      )}
    </div>
  );
}

export default function App() {
  return <AuthGate>{(session) => <MainLayout userId={session.user.id} />}</AuthGate>;
}
