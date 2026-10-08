import { useState } from "react";
import type { CodeQuestion } from "../../interviewer/content/types";
import { codeScore } from "../../interviewer/schedule";
import { engine } from "../../practice/engine/client";
import { compareResults } from "../../practice/check";
import type { RunResult } from "../../practice/engine/protocol";
import { CodeEditor } from "../practice/CodeEditor";
import { ResultView } from "../practice/ResultView";

interface Props {
  question: CodeQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function CodeCard({ question, onDone }: Props) {
  const [code, setCode] = useState(question.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mode = question.section;

  async function run() {
    setBusy(true);
    try {
      setResult(await engine.run(mode, code));
    } catch (e) {
      setResult({ ok: false, stdout: "", stderr: "", error: e instanceof Error ? e.message : String(e), images: [] });
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      let ok = false;
      let message = "";
      if (mode === "sql") {
        const r = await engine.sqlCheck(code, question.solution);
        if (r.user && r.expected) {
          const o = compareResults(r.user, r.expected, question.ordered === true);
          ok = o.ok;
          message = o.ok ? "Correct!" : o.message;
        } else message = r.error ?? "Your query didn't run.";
      } else {
        const r = await engine.run("python", code, question.tests);
        setResult(r);
        ok = r.test?.passed === true;
        message = ok ? "Correct!" : r.test?.message ?? r.error ?? "Not quite.";
      }
      setVerdict({ ok, message });
      if (ok) onDone({ score: codeScore(!failedOnce, revealed), answer: code, checked: [] });
      else setFailedOnce(true);
    } catch (e) {
      setVerdict({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="iv-card">
      <p className="iv-prompt">{question.prompt}</p>
      <CodeEditor value={code} onChange={setCode} onRun={() => void run()} label="Your answer" rows={10} />
      <div className="exercise__actions">
        <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => void run()}>Run</button>
        <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void check()}>Check</button>
        {failedOnce && !revealed && (
          <button className="btn btn--ghost btn--sm" onClick={() => setRevealed(true)}>Show solution</button>
        )}
        {revealed && (
          <button className="btn btn--ghost btn--sm" onClick={() => onDone({ score: codeScore(false, true), answer: code, checked: [] })}>
            Next question
          </button>
        )}
      </div>
      {verdict && <p className={`exercise__verdict ${verdict.ok ? "is-ok" : "is-bad"}`}>{verdict.message}</p>}
      {revealed && <pre className="exercise__solution">{question.solution}</pre>}
      {result && <ResultView result={result} />}
    </div>
  );
}
