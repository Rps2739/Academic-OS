import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Play, RotateCcw, Square } from "lucide-react";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { engine, type EngineStatus } from "../practice/engine/client";
import type { RunResult } from "../practice/engine/protocol";
import { lessonsFor } from "../practice/content";
import type { Lesson, Track } from "../practice/content/types";
import { loadProgress, markPassed, saveCode, type ItemProgress } from "../practice/store";
import { CodeEditor } from "./practice/CodeEditor";
import { ResultView } from "./practice/ResultView";
import { LessonText } from "./practice/LessonText";
import { ExerciseCard } from "./practice/ExerciseCard";
import { DatasetsPanel } from "./practice/DatasetsPanel";

const STATUS_TEXT: Record<EngineStatus, string> = {
  idle: "Stopped",
  starting: "Starting Python… (first time takes a few seconds)",
  ready: "Ready",
  busy: "Running…",
  error: "Engine error",
};

export function PracticeView({ localDb }: { localDb: SqliteLocalDb }) {
  const [track, setTrack] = useState<Track>("sql");
  const [lessonId, setLessonId] = useState<string | "datasets">(() => lessonsFor("sql")[0]?.id ?? "datasets");
  const [status, setStatus] = useState<EngineStatus>(engine.status);
  const [progress, setProgress] = useState<Map<string, ItemProgress>>(new Map());
  const [exampleCode, setExampleCode] = useState("");
  const [exampleResult, setExampleResult] = useState<RunResult | null>(null);
  const diagClicks = useRef(0);

  const lessons = useMemo(() => lessonsFor(track), [track]);
  const lesson: Lesson | undefined = lessons.find((l) => l.id === lessonId);

  useEffect(() => engine.onStatus(setStatus), []);
  useEffect(() => {
    void engine.start().catch(() => {});
    void loadProgress(localDb).then(setProgress);
  }, [localDb]);
  useEffect(() => {
    setExampleCode(lesson?.example ?? "");
    setExampleResult(null);
  }, [lesson]);

  const refresh = () => void loadProgress(localDb).then(setProgress);
  const done = (l: Lesson) => l.exercises.filter((e) => progress.get(e.id)?.status === "passed").length;

  async function runExample() {
    if (!lesson) return;
    try {
      setExampleResult(await engine.run(lesson.track, exampleCode));
    } catch (err) {
      setExampleResult({ ok: false, stdout: "", stderr: "", error: err instanceof Error ? err.message : String(err), images: [] });
    }
  }

  return (
    <div className="practice">
      <aside className="practice__nav">
        <div className="practice__tracks">
          {(["sql", "python"] as const).map((t) => (
            <button
              key={t}
              className={`news-view__subtab ${track === t ? "news-view__subtab--active" : ""}`}
              onClick={() => {
                setTrack(t);
                setLessonId(lessonsFor(t)[0]?.id ?? "datasets");
              }}
            >
              {t === "sql" ? "SQL" : "Python"}
            </button>
          ))}
        </div>
        <ol className="practice__lessons">
          {lessons.map((l) => (
            <li key={l.id}>
              <button className={`practice__lesson ${lessonId === l.id ? "is-active" : ""}`} onClick={() => setLessonId(l.id)}>
                <span>{l.title}</span>
                <span className="practice__count">
                  {done(l)}/{l.exercises.length}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <button className={`practice__lesson ${lessonId === "datasets" ? "is-active" : ""}`} onClick={() => setLessonId("datasets")}>
          <span>
            <Database size={13} strokeWidth={2} /> Datasets
          </span>
        </button>
      </aside>

      <section className="practice__main">
        <header className="practice__bar">
          <span
            className={`practice__status practice__status--${status}`}
            onClick={() => {
              // Hidden support hook: 5 clicks log what the engine loaded and
              // whether it can see Tauri (it must not) — used in verification.
              diagClicks.current += 1;
              if (diagClicks.current === 5) {
                diagClicks.current = 0;
                void engine.diagnostics().then((d) => console.log("practice-diagnostics " + JSON.stringify(d)));
              }
            }}
          >
            {status === "error" ? `${STATUS_TEXT.error}: ${engine.lastError}` : STATUS_TEXT[status]}
          </span>
          <button className="btn btn--ghost btn--sm" disabled={status !== "busy"} onClick={() => engine.stop()} title="Stop a long-running run">
            <Square size={13} strokeWidth={2} /> Stop
          </button>
          <button className="btn btn--ghost btn--sm" disabled={status !== "ready"} onClick={() => void engine.resetData()} title="Undo any changes your SQL made to the tables">
            <RotateCcw size={13} strokeWidth={2} /> Reset data
          </button>
        </header>

        {lessonId === "datasets" || !lesson ? (
          <DatasetsPanel />
        ) : (
          <article className="lesson">
            <h2>{lesson.title}</h2>
            <LessonText text={lesson.body} />
            <h3>Try it</h3>
            <CodeEditor value={exampleCode} onChange={setExampleCode} onRun={() => void runExample()} label="Example code" />
            <div className="exercise__actions">
              <button className="btn btn--primary btn--sm" onClick={() => void runExample()} disabled={status === "busy" || status === "starting"}>
                <Play size={13} strokeWidth={2} /> Run (Ctrl+Enter)
              </button>
            </div>
            {exampleResult && <ResultView result={exampleResult} />}
            {lesson.exercises.map((ex, i) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                track={lesson.track}
                index={i}
                passed={progress.get(ex.id)?.status === "passed"}
                savedCode={progress.get(ex.id)?.lastCode ?? null}
                onSaveCode={(code) => void saveCode(localDb, ex.id, code)}
                onPassed={(code) => void markPassed(localDb, ex.id, code).then(refresh)}
              />
            ))}
          </article>
        )}
      </section>
    </div>
  );
}
