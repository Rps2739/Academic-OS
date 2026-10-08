import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { SECTIONS, cvQuestions } from "../interviewer/content";
import type { Question, Section } from "../interviewer/content/types";
import { buildQueue, sectionCounts, type AttemptSummary } from "../interviewer/schedule";
import { getCv, latestAttempts, saveAttempt, setCv } from "../interviewer/store";
import { engine } from "../practice/engine/client";
import { Timer } from "./interviewer/Timer";
import { SelfCard } from "./interviewer/SelfCard";
import { CodeCard } from "./interviewer/CodeCard";
import { VizCard } from "./interviewer/VizCard";
import { CaseCard } from "./interviewer/CaseCard";
import { CvEditor } from "./interviewer/CvEditor";

const TIMER_KEY = (s: string) => `academicos.interviewTimer.${s}`;

export function InterviewerView({ localDb }: { localDb: SqliteLocalDb }) {
  const [latest, setLatest] = useState<Map<string, AttemptSummary>>(new Map());
  const [cvText, setCvText] = useState("");
  const [editingCv, setEditingCv] = useState(false);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [timerMin, setTimerMin] = useState(0);

  const reload = async () => setLatest(await latestAttempts(localDb));
  useEffect(() => {
    void reload();
    void getCv(localDb).then(setCvText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDb]);

  const questionsFor = (s: Section): Question[] => (s.id === "cv" ? cvQuestions(cvText) : s.questions);
  const section = SECTIONS.find((s) => s.id === sectionId) ?? null;
  const byId = useMemo(() => new Map(section ? questionsFor(section).map((q) => [q.id, q]) : []), [section, cvText]);
  const current = byId.get(queue[pos] ?? "");

  function open(s: Section) {
    const ids = questionsFor(s).map((q) => q.id);
    setSectionId(s.id);
    setQueue(buildQueue(ids, latest, new Date()));
    setPos(0);
    let saved = s.timerDefaultMin;
    try {
      const v = localStorage.getItem(TIMER_KEY(s.id));
      if (v !== null) saved = Number(v);
    } catch {
      /* ignore */
    }
    setTimerMin(saved);
    if (s.id === "sql" || s.id === "python" || s.id === "dataviz") void engine.start().catch(() => {});
  }

  async function done(r: { score: number; answer: string; checked: string[] }) {
    if (!current || !section) return;
    await saveAttempt(localDb, {
      questionId: current.id,
      section: section.id,
      answer: r.answer,
      checked: r.checked,
      score: r.score,
      prevScore: latest.get(current.id)?.score ?? null,
    });
    await reload();
    setPos((p) => p + 1);
  }

  if (!section) {
    const now = new Date();
    return (
      <div className="iv">
        <h2 className="iv__heading">Interviewer</h2>
        <p className="practice-muted">Answer as you would in the room, then compare with the checklist and model answer. Low scores come back sooner.</p>
        <div className="iv-grid">
          {SECTIONS.map((s) => {
            const c = sectionCounts(questionsFor(s).map((q) => q.id), latest, now);
            return (
              <button key={s.id} className="iv-tile" onClick={() => open(s)}>
                <span className="iv-tile__title">{s.title}</span>
                <span className="iv-tile__blurb">{s.blurb}</span>
                <span className="iv-tile__counts">
                  {c.due} due · {c.fresh} new · {c.weak} weak · {c.total} total
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const showCvEditor = section.id === "cv" && (editingCv || cvText.trim() === "");

  return (
    <div className="iv">
      <header className="iv__bar">
        <button className="btn btn--ghost btn--sm" onClick={() => setSectionId(null)}>
          <ArrowLeft size={13} strokeWidth={2} /> Sections
        </button>
        <strong>{section.title}</strong>
        <span className="practice-muted">
          {Math.min(pos + 1, queue.length)} / {queue.length}
        </span>
        <label className="iv__timer-pick">
          Timer
          <select
            value={timerMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimerMin(v);
              try {
                localStorage.setItem(TIMER_KEY(section.id), String(v));
              } catch {
                /* ignore */
              }
            }}
          >
            {[0, 2, 5, 10].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Off" : `${m} min`}
              </option>
            ))}
          </select>
        </label>
        {current && <Timer minutes={timerMin} resetKey={current.id} />}
        {section.id === "cv" && !showCvEditor && (
          <button className="btn btn--ghost btn--sm" onClick={() => setEditingCv(true)}>
            <FileText size={13} strokeWidth={2} /> Edit CV
          </button>
        )}
      </header>

      {showCvEditor ? (
        <CvEditor
          initial={cvText}
          onSave={(text) =>
            void setCv(localDb, text).then(() => {
              setCvText(text);
              setEditingCv(false);
              const ids = cvQuestions(text).map((q) => q.id);
              setQueue(buildQueue(ids, latest, new Date()));
              setPos(0);
            })
          }
        />
      ) : !current ? (
        <div className="iv-card">
          <p className="iv-prompt">Nothing due in this section right now — well done. Come back later, or pick another section.</p>
        </div>
      ) : current.kind === "self" ? (
        <SelfCard key={current.id} question={current} onDone={(r) => void done(r)} />
      ) : current.kind === "code" ? (
        <CodeCard key={current.id} question={current} onDone={(r) => void done(r)} />
      ) : current.kind === "viz" ? (
        <VizCard key={current.id} question={current} onDone={(r) => void done(r)} />
      ) : (
        <CaseCard key={current.id} question={current} onDone={(r) => void done(r)} />
      )}
    </div>
  );
}
