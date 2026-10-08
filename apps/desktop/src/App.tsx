import { useEffect, useRef, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import { FileText, NotebookText, ListTodo, CalendarDays, Undo2, Home, BookOpen, Briefcase, Columns2, X, Newspaper, FlaskConical, MessagesSquare } from "lucide-react";
import { AuthGate } from "./components/AuthGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TreeSidebar } from "./components/TreeSidebar";
import { PageEditor } from "./components/PageEditor";
import { NoteOutline } from "./components/NoteOutline";
import { AttachmentsRail } from "./components/AttachmentsRail";
import type { Block } from "@blocknote/core";
import { TaskList } from "./components/TaskList";
import { TimetableView } from "./components/TimetableView";
import { HomeView } from "./components/HomeView";
import { SubjectsView } from "./components/SubjectsView";
import { ProjectsView } from "./components/ProjectsView";
import { NewsView } from "./components/NewsView";
import { PracticeView } from "./components/PracticeView";
import { InterviewerView } from "./components/InterviewerView";
import { SqliteLocalDb } from "./lib/sqlite-local-db";
import { createSyncController } from "./lib/sync-loop";
import { createGTasksSyncController } from "./lib/gtasks-sync-loop";
import { createGCalSyncController } from "./lib/gcal-sync-loop";
import { startGdPrepLoop } from "./lib/gd-prep-loop";
import { GoogleAuthBanner } from "./components/GoogleAuthBanner";
import { checkDatabase, isCorruptionError, maybeDailyBackup, requestRepair, takeRepairNotice } from "./lib/db-health";
import { enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import "./App.css";

type View = "home" | "notes" | "tasks" | "subjects" | "projects" | "timetable" | "news" | "practice" | "interviewer";

function MainLayout({ userId }: { userId: string }) {
  const [localDb, setLocalDb] = useState<SqliteLocalDb | null>(null);
  const [dbBroken, setDbBroken] = useState(false);
  const [selected, setSelected] = useState<LocalRow | null>(null);
  const [splitSelected, setSplitSelected] = useState<LocalRow | null>(null);
  const [outlineBlocks, setOutlineBlocks] = useState<Block[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; nonce: number } | null>(null);
  const [view, setView] = useState<View>("home");
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);
  const startedRef = useRef(false);
  const syncRef = useRef<ReturnType<typeof createSyncController> | null>(null);
  // Lets the "Google sign-in expired" banner run one calendar sync on demand.
  const recheckGoogleRef = useRef<() => Promise<void>>(async () => {});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** A low-friction safety net for deletes: no "are you sure?" dialog
   * (deliberately — that's the friction the user asked to remove), just
   * delete immediately (it's already a soft-delete, nothing destroyed)
   * and offer a few seconds to undo it, the same pattern most editors
   * and Gmail use. */
  function notify(message: string, undo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }

  function dismissToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Each controller's start() returns its own teardown; collect them so
    // the effect cleanup can stop every interval and focus listener rather
    // than leaking them (harmless while the app is single-lifetime, but
    // correct, and it stops duplicate loops under React StrictMode/HMR).
    const stops: Array<() => void> = [];

    void SqliteLocalDb.open()
      .catch((err) => {
        // A corrupt file makes the plugin's first load (which also runs the
        // migrations) throw before we ever get a handle.
        if (isCorruptionError(err)) setDbBroken(true);
        else console.error("opening the local database failed:", err);
        return null;
      })
      .then(async (db) => {
      if (!db) return;
      if (!(await checkDatabase(db))) {
        setDbBroken(true);
        return;
      }
      setLocalDb(db);
      // If the previous run repaired a damaged database, tell the user.
      const repairedInto = await takeRepairNotice();
      if (repairedInto) {
        notify(
          `Your local copy was damaged, so the app rebuilt it from your Supabase copy. The damaged file was kept in ${repairedInto}. Daily backups are in the "backups" folder next to it.`,
          () => {}
        );
      }
      const deviceId = await db.getOrCreateDeviceId();
      const controller = createSyncController(db, deviceId);
      syncRef.current = controller;
      stops.push(controller.start());

      // Google Tasks sync writes straight to Postgres; this just makes
      // sure the local mirror picks it up promptly instead of waiting
      // for the main sync loop's own next interval.
      const gtasks = createGTasksSyncController(() => controller.triggerSync());
      stops.push(gtasks.start());

      const gcal = createGCalSyncController(() => controller.triggerSync());
      recheckGoogleRef.current = () => gcal.runOnce();
      stops.push(gcal.start());

      // GD Prep: scheduled scan for GD/interview-worthy news (local-only).
      stops.push(startGdPrepLoop(db));

      // After the sync loops are going, so a slow backup never delays them.
      void maybeDailyBackup(db);
    });

    // The app is meant to always be running (it's what keeps the desktop
    // widgets and the Ctrl+Alt+N capture shortcut alive) — enable
    // launch-at-login once rather than asking the user to find a setting.
    void isAutostartEnabled().then((already) => {
      if (!already) void enableAutostart();
    });

    return () => {
      for (const stop of stops) stop();
    };
  }, []);

  function triggerSync() {
    syncRef.current?.triggerSync();
    setRefreshTick((t) => t + 1);
  }

  /** Jumps to Notes with a given folder selected and its ancestor chain
   * expanded in the tree — how Subjects' "Open notes folder" surfaces a
   * subject's linked folder instead of leaving it to be found by hand. */
  async function openNotesFolder(nodeId: string) {
    const node = await localDb?.getLocal("nodes", nodeId);
    if (!node) return;
    setSelected(node);
    setFocusRequest({ nodeId, nonce: Date.now() });
    setView("notes");
  }

  if (dbBroken) {
    return (
      <div className="db-repair">
        <h1>Your local notes database is damaged</h1>
        <p>
          This happens rarely (for example if the app was interrupted while saving). Your notes, tasks and classes are safe
          in your Supabase copy.
        </p>
        <p>
          <strong>Repair and restart</strong> moves the damaged file into a dated backup folder (nothing is deleted),
          restarts the app, and downloads everything again from Supabase. Things that live only on this laptop (GD Prep
          stories, practice progress, note edit history) can be recovered from the daily backups folder if needed.
        </p>
        <button className="btn btn--primary" onClick={() => void requestRepair()}>
          Repair and restart
        </button>
      </div>
    );
  }

  if (!localDb) {
    return (
      <div className="app-loading">
        <span className="spinner" aria-hidden /> Starting local database…
      </div>
    );
  }

  return (
    <>
    <GoogleAuthBanner onRecheck={() => recheckGoogleRef.current()} />
    <div className="app-layout">
      <nav className="nav-rail">
        {([
          { id: "home", label: "Home", Icon: Home },
          { id: "notes", label: "Notes", Icon: NotebookText },
          { id: "tasks", label: "Tasks", Icon: ListTodo },
          { id: "subjects", label: "Subjects", Icon: BookOpen },
          { id: "projects", label: "Projects", Icon: Briefcase },
          { id: "timetable", label: "Timetable", Icon: CalendarDays },
          { id: "news", label: "News", Icon: Newspaper },
          { id: "practice", label: "Practice", Icon: FlaskConical },
          { id: "interviewer", label: "Interviewer", Icon: MessagesSquare },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-rail__item ${view === id ? "nav-rail__item--active" : ""}`}
            title={label}
            aria-current={view === id ? "page" : undefined}
            onClick={() => setView(id)}
          >
            <Icon size={19} strokeWidth={1.75} />
            <span className="nav-rail__label">{label}</span>
          </button>
        ))}
      </nav>
      <ErrorBoundary key={view}>
      {view === "home" ? (
        <main className="app-main app-main--home">
          <HomeView
            localDb={localDb}
            userId={userId}
            onChanged={triggerSync}
            onOpenNote={(node) => {
              setSelected(node);
              setView("notes");
            }}
            onGoToView={setView}
            refreshSignal={refreshTick}
          />
        </main>
      ) : view === "notes" ? (
        <>
          <TreeSidebar
            localDb={localDb}
            userId={userId}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onChanged={triggerSync}
            onNodesDeleted={(ids) => {
              if (selected && ids.includes(selected.id as string)) setSelected(null);
              if (splitSelected && ids.includes(splitSelected.id as string)) setSplitSelected(null);
            }}
            onNotify={notify}
            refreshSignal={refreshTick}
            focusRequest={focusRequest}
            onOpenInSplit={setSplitSelected}
          />
          <main className={`app-main ${splitSelected ? "app-main--split" : ""}`}>
            <div className="app-pane">
              {selected ? (
                <>
                  {selected["kind"] === "page" ? (
                    // Wrap editor + outline rail; rail hides when split view is active (no room)
                    <div className={splitSelected ? undefined : "page-editor-with-rail"}>
                      <PageEditor
                        localDb={localDb}
                        userId={userId}
                        node={selected}
                        onSaved={triggerSync}
                        onDocumentChange={splitSelected ? undefined : setOutlineBlocks}
                      />
                      {!splitSelected && <NoteOutline blocks={outlineBlocks} />}
                    </div>
                  ) : (
                    <h2 className="page-editor__title">{selected["title"] as string}</h2>
                  )}
                  <AttachmentsRail
                    localDb={localDb}
                    userId={userId}
                    node={selected}
                    onChanged={triggerSync}
                    onNotify={notify}
                  />
                </>
              ) : (
                <div className="app-main__empty">
                  <FileText size={28} strokeWidth={1.5} />
                  <span>Select a page, or create one from the sidebar.</span>
                </div>
              )}
            </div>
            {splitSelected && (
              <div className="app-pane app-pane--split">
                <div className="app-pane__split-header">
                  <Columns2 size={13} strokeWidth={2} />
                  <span className="app-pane__split-title">{splitSelected["title"] as string}</span>
                  <button className="icon-btn" title="Close split pane" onClick={() => setSplitSelected(null)}>
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
                {splitSelected["kind"] === "page" ? (
                  <PageEditor localDb={localDb} userId={userId} node={splitSelected} onSaved={triggerSync} />
                ) : (
                  <h2 className="page-editor__title">{splitSelected["title"] as string}</h2>
                )}
                <AttachmentsRail
                  localDb={localDb}
                  userId={userId}
                  node={splitSelected}
                  onChanged={triggerSync}
                  onNotify={notify}
                />
              </div>
            )}
          </main>
        </>
      ) : view === "tasks" ? (
        <main className="app-main app-main--tasks">
          <TaskList
            localDb={localDb}
            userId={userId}
            onChanged={triggerSync}
            onNotify={notify}
            refreshSignal={refreshTick}
          />
        </main>
      ) : view === "subjects" ? (
        <main className="app-main app-main--subjects">
          <SubjectsView
            localDb={localDb}
            userId={userId}
            onChanged={triggerSync}
            onOpenFolder={(nodeId) => void openNotesFolder(nodeId)}
            onGoToView={setView}
            onNotify={notify}
          />
        </main>
      ) : view === "projects" ? (
        <main className="app-main app-main--projects">
          <ProjectsView localDb={localDb} userId={userId} onChanged={triggerSync} onNotify={notify} />
        </main>
      ) : view === "news" ? (
        <main className="app-main app-main--news">
          <NewsView localDb={localDb} userId={userId} onChanged={triggerSync} onNotify={notify} />
        </main>
      ) : view === "practice" ? (
        <main className="app-main app-main--practice">
          <PracticeView localDb={localDb} />
        </main>
      ) : view === "interviewer" ? (
        <main className="app-main app-main--interviewer">
          <InterviewerView localDb={localDb} />
        </main>
      ) : (
        <main className="app-main app-main--timetable">
          <TimetableView localDb={localDb} userId={userId} onChanged={triggerSync} />
        </main>
      )}
      </ErrorBoundary>
      {toast && (
        <div className="undo-toast" role="status">
          <span className="undo-toast__message">{toast.message}</span>
          <button
            className="undo-toast__action"
            onClick={() => {
              toast.undo();
              dismissToast();
            }}
          >
            <Undo2 size={13} strokeWidth={2} />
            Undo
          </button>
        </div>
      )}
    </div>
    </>
  );
}

export default function App() {
  return <AuthGate>{(session) => <MainLayout userId={session.user.id} />}</AuthGate>;
}
