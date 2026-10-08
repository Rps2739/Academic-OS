import { useState } from "react";
import { cvPrompts } from "../../interviewer/cv";

/** Paste the CV once; it stays on this laptop only (interview_cv_local). */
export function CvEditor({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const n = cvPrompts(text).length;
  return (
    <div className="iv-card">
      <p className="iv-prompt">Paste your CV text below. It's stored only on this laptop. Each substantial line becomes a "walk me through this" question.</p>
      <textarea className="iv-answer" rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your CV here…" />
      <div className="exercise__actions">
        <button className="btn btn--primary btn--sm" onClick={() => onSave(text)}>
          Save ({n} question{n === 1 ? "" : "s"} from your CV)
        </button>
      </div>
    </div>
  );
}
