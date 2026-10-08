import { useMemo, useState } from "react";
import type { SelfQuestion } from "../../interviewer/content/types";
import { suggestScore } from "../../interviewer/schedule";

interface Props {
  question: SelfQuestion;
  onDone: (r: { score: number; answer: string; checked: string[] }) => void;
}

export function ScorePicker({ suggested, onPick }: { suggested: number; onPick: (s: number) => void }) {
  return (
    <div className="iv-score">
      <span>How did you do?</span>
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} className={`iv-score__btn ${s === suggested ? "is-suggested" : ""}`} onClick={() => onPick(s)} title={s === suggested ? "Suggested from your checklist" : undefined}>
          {s}
        </button>
      ))}
    </div>
  );
}

export function Checklist({ items, checked, onToggle }: { items: string[]; checked: Set<number>; onToggle: (i: number) => void }) {
  return (
    <ul className="iv-checklist">
      {items.map((k, i) => (
        <li key={i}>
          <label>
            <input type="checkbox" checked={checked.has(i)} onChange={() => onToggle(i)} /> {k}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function SelfCard({ question, onDone }: Props) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const suggested = useMemo(() => suggestScore(checked.size, question.keyPoints.length), [checked, question]);
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
      <textarea className="iv-answer" rows={8} placeholder="Type your answer as you'd say it…" value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={revealed} />
      {!revealed ? (
        <button className="btn btn--primary btn--sm" onClick={() => setRevealed(true)}>
          Submit and compare
        </button>
      ) : (
        <>
          <h4>Tick what your answer covered</h4>
          <Checklist items={question.keyPoints} checked={checked} onToggle={toggle} />
          <h4>Model answer</h4>
          <p className="iv-model">{question.modelAnswer}</p>
          <h4>Common mistakes</h4>
          <ul className="iv-mistakes">
            {question.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <ScorePicker suggested={suggested} onPick={(score) => onDone({ score, answer, checked: [...checked].map((i) => question.keyPoints[i]!) })} />
        </>
      )}
    </div>
  );
}
