import { useEffect, useMemo, useState } from "react";
import type { VizQuestion } from "../../interviewer/content/types";
import { suggestScore } from "../../interviewer/schedule";
import { engine } from "../../practice/engine/client";
import type { RunResult } from "../../practice/engine/protocol";
import { CodeEditor } from "../practice/CodeEditor";
import { ResultView } from "../practice/ResultView";
import { Checklist, ScorePicker } from "./SelfCard";

const referenceCache = new Map<string, string>();

interface Props {
  question: VizQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function VizCard({ question, onDone }: Props) {
  const [reference, setReference] = useState<string | null>(referenceCache.get(question.id) ?? null);
  const [refError, setRefError] = useState("");
  const [code, setCode] = useState(question.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const suggested = useMemo(() => suggestScore(checked.size, question.checklist.length), [checked, question]);

  useEffect(() => {
    if (referenceCache.has(question.id)) return;
    engine.run("python", question.referenceCode).then(
      (r) => {
        const img = r.images[0];
        if (img) {
          referenceCache.set(question.id, img);
          setReference(img);
        } else setRefError(r.error ?? "The reference chart didn't render.");
      },
      (e: Error) => setRefError(e.message)
    );
  }, [question]);

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="iv-card">
      <p className="iv-prompt">{question.prompt}</p>
      <div className="iv-viz">
        <figure>
          <figcaption>Target</figcaption>
          {reference ? <img className="practice-result__chart" src={reference} alt="Reference chart" /> : <p className="practice-muted">{refError || "Rendering…"}</p>}
        </figure>
        <figure>
          <figcaption>Yours</figcaption>
          {result?.images[0] ? <img className="practice-result__chart" src={result.images[0]} alt="Your chart" /> : <p className="practice-muted">Run your code to see it here.</p>}
        </figure>
      </div>
      <CodeEditor value={code} onChange={setCode} onRun={() => void engine.run("python", code).then(setResult)} label="Your chart code" rows={10} />
      <div className="exercise__actions">
        <button className="btn btn--primary btn--sm" onClick={() => void engine.run("python", code).then(setResult)}>Run</button>
      </div>
      {result && !result.images[0] && <ResultView result={result} />}
      {result?.images[0] && (
        <>
          <h4>Compare against the checklist</h4>
          <Checklist items={question.checklist} checked={checked} onToggle={toggle} />
          <ScorePicker suggested={suggested} onPick={(score) => onDone({ score, answer: code, checked: [...checked].map((i) => question.checklist[i]!) })} />
        </>
      )}
    </div>
  );
}
