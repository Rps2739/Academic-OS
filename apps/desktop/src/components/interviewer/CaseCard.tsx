import { useMemo, useState } from "react";
import type { CaseQuestion } from "../../interviewer/content/types";
import { suggestScore } from "../../interviewer/schedule";
import { DataTable } from "../practice/ResultView";
import { Checklist, ScorePicker } from "./SelfCard";

interface Props {
  question: CaseQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function CaseCard({ question, onDone }: Props) {
  const [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => question.stages.map(() => ""));
  const [scores, setScores] = useState<number[]>([]);
  const [shownExhibits, setShownExhibits] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [allChecked, setAllChecked] = useState<string[]>([]);
  const stage = question.stages[stageIndex]!;
  const suggested = useMemo(() => suggestScore(checked.size, stage.checklist.length), [checked, stage]);

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  function finishStage(score: number) {
    const ticked = [...checked].map((i) => `${stage.name}: ${stage.checklist[i]}`);
    const nextScores = [...scores, score];
    const nextChecked = [...allChecked, ...ticked];
    if (stageIndex === question.stages.length - 1) {
      const avg = Math.round(nextScores.reduce((a, b) => a + b, 0) / nextScores.length);
      onDone({ score: avg, answer: JSON.stringify(question.stages.map((s, i) => ({ stage: s.name, answer: answers[i] }))), checked: nextChecked });
      return;
    }
    setScores(nextScores);
    setAllChecked(nextChecked);
    setStageIndex(stageIndex + 1);
    setRevealed(false);
    setShownExhibits(false);
    setChecked(new Set());
  }

  return (
    <div className="iv-card">
      <h3 className="iv-case__title">{question.title}</h3>
      <p className="iv-prompt">{question.prompt}</p>
      <ol className="iv-stages">
        {question.stages.map((s, i) => (
          <li key={s.name} className={i === stageIndex ? "is-current" : i < stageIndex ? "is-done" : undefined}>
            {s.name}
          </li>
        ))}
      </ol>
      <p className="iv-ask">{stage.ask}</p>
      {stage.exhibits && !shownExhibits && (
        <button className="btn btn--secondary btn--sm" onClick={() => setShownExhibits(true)}>
          Show the data
        </button>
      )}
      {stage.exhibits &&
        shownExhibits &&
        stage.exhibits.map((ex) => (
          <figure key={ex.title} className="iv-exhibit">
            <figcaption>{ex.title}</figcaption>
            <DataTable table={{ columns: ex.columns, rows: ex.rows, total: ex.rows.length }} />
          </figure>
        ))}
      <textarea
        className="iv-answer"
        rows={7}
        value={answers[stageIndex]}
        disabled={revealed}
        onChange={(e) => setAnswers((prev) => prev.map((a, i) => (i === stageIndex ? e.target.value : a)))}
        placeholder="Your answer for this stage…"
      />
      {!revealed ? (
        <button className="btn btn--primary btn--sm" onClick={() => setRevealed(true)}>
          Submit and compare
        </button>
      ) : (
        <>
          <h4>Tick what you covered</h4>
          <Checklist items={stage.checklist} checked={checked} onToggle={toggle} />
          <h4>Model {stage.name.toLowerCase()}</h4>
          <p className="iv-model">{stage.model}</p>
          <ScorePicker suggested={suggested} onPick={finishStage} />
        </>
      )}
    </div>
  );
}
