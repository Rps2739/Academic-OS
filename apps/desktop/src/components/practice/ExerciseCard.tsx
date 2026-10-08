import { useState } from "react";
import { Check, Lightbulb, Play, Eye } from "lucide-react";
import type { Exercise, Track } from "../../practice/content/types";
import type { RunResult } from "../../practice/engine/protocol";
import { engine } from "../../practice/engine/client";
import { compareResults } from "../../practice/check";
import { CodeEditor } from "./CodeEditor";
import { ResultView } from "./ResultView";

interface ExerciseCardProps {
  exercise: Exercise;
  track: Track;
  index: number;
  passed: boolean;
  savedCode: string | null;
  onSaveCode: (code: string) => void;
  onPassed: (code: string) => void;
}

export function ExerciseCard({ exercise, track, index, passed, savedCode, onSaveCode, onPassed }: ExerciseCardProps) {
  const [code, setCode] = useState(savedCode ?? exercise.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    onSaveCode(code);
    try {
      setResult(await engine.run(track, code));
    } catch (err) {
      setResult({ ok: false, stdout: "", stderr: "", error: err instanceof Error ? err.message : String(err), images: [] });
    } finally {
      setRunning(false);
    }
  }

  async function check() {
    setRunning(true);
    setAttempted(true);
    onSaveCode(code);
    try {
      if (track === "sql") {
        const r = await engine.sqlCheck(code, exercise.solution);
        if (!r.user || !r.expected) {
          setVerdict({ ok: false, message: r.error ?? "Your query didn't run." });
        } else {
          const outcome = compareResults(r.user, r.expected, exercise.ordered === true);
          setVerdict(outcome.ok ? { ok: true, message: "Correct!" } : { ok: false, message: outcome.message });
          if (outcome.ok) onPassed(code);
        }
      } else {
        const r = await engine.run("python", code, exercise.tests);
        setResult(r);
        const ok = r.test?.passed === true;
        setVerdict(ok ? { ok: true, message: "Correct!" } : { ok: false, message: r.test?.message ?? r.error ?? "Not quite." });
        if (ok) onPassed(code);
      }
    } catch (err) {
      setVerdict({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className={`exercise ${passed ? "exercise--passed" : ""}`}>
      <h4 className="exercise__title">
        Exercise {index + 1} {passed && <Check size={14} strokeWidth={2.5} />}
      </h4>
      <p className="exercise__prompt">{exercise.prompt}</p>
      <CodeEditor value={code} onChange={setCode} onRun={() => void run()} label={`Exercise ${index + 1} code`} />
      <div className="exercise__actions">
        <button className="btn btn--secondary btn--sm" disabled={running} onClick={() => void run()}>
          <Play size={13} strokeWidth={2} /> Run
        </button>
        <button className="btn btn--primary btn--sm" disabled={running} onClick={() => void check()}>
          <Check size={13} strokeWidth={2} /> Check
        </button>
        {exercise.hint && (
          <button className="btn btn--ghost btn--sm" onClick={() => setShowHint((v) => !v)}>
            <Lightbulb size={13} strokeWidth={2} /> Hint
          </button>
        )}
        {attempted && (
          <button className="btn btn--ghost btn--sm" onClick={() => setShowSolution((v) => !v)}>
            <Eye size={13} strokeWidth={2} /> {showSolution ? "Hide solution" : "Show solution"}
          </button>
        )}
      </div>
      {showHint && exercise.hint && <p className="exercise__hint">{exercise.hint}</p>}
      {verdict && <p className={`exercise__verdict ${verdict.ok ? "is-ok" : "is-bad"}`}>{verdict.message}</p>}
      {showSolution && <pre className="exercise__solution">{exercise.solution}</pre>}
      {result && <ResultView result={result} />}
    </section>
  );
}
