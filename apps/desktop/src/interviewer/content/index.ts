import type { Question, Section, SelfQuestion } from "./types";
import { HR } from "./hr";
import { GUESSTIMATES } from "./guesstimate";
import { POWER_BI } from "./powerbi";
import { DATAVIZ } from "./dataviz";
import { SQL_Q } from "./sql";
import { PY_Q } from "./python";
import { CASES } from "./case";
import { CV_GENERIC } from "./cv";
import { cvPrompts } from "../cv";

export const SECTIONS: Section[] = [
  { id: "case", title: "Case interviews", blurb: "Staged cases: clarify, structure, analyse, recommend.", timerDefaultMin: 0, questions: CASES },
  { id: "guesstimate", title: "Guesstimates", blurb: "Market sizing with Indian contexts.", timerDefaultMin: 5, questions: GUESSTIMATES },
  { id: "powerbi", title: "Power BI", blurb: "Modelling, DAX and dashboard design.", timerDefaultMin: 0, questions: POWER_BI },
  { id: "dataviz", title: "Data visualisation", blurb: "Choosing, critiquing and building charts.", timerDefaultMin: 0, questions: DATAVIZ },
  { id: "sql", title: "SQL", blurb: "Interview SQL on the Bharat Retail tables — auto-checked.", timerDefaultMin: 10, questions: SQL_Q },
  { id: "python", title: "Python", blurb: "Coding and pandas questions — auto-checked.", timerDefaultMin: 10, questions: PY_Q },
  { id: "cv", title: "CV", blurb: "Questions about your own CV lines.", timerDefaultMin: 2, questions: CV_GENERIC },
  { id: "hr", title: "HR & standard", blurb: "Tell me about yourself, why MBA, strengths…", timerDefaultMin: 2, questions: HR },
];

const CV_CHECKLIST = [
  "Context: where, when, why it mattered",
  "What YOU did (not the team)",
  "A measurable result",
  "What you learned",
  "Why it matters for this role",
];

/** CV section = generic CV questions + one prompt per substantial line of the user's CV. */
export function cvQuestions(cvText: string): Question[] {
  const fromCv: SelfQuestion[] = cvPrompts(cvText).map((p) => ({
    kind: "self",
    id: p.id,
    section: "cv",
    prompt: `Walk me through this line from your CV: "${p.line}"`,
    keyPoints: CV_CHECKLIST,
    modelAnswer:
      "Use a short STAR shape: one sentence of Situation and Task, two or three sentences on the Actions you personally took, then the Result with a number, and close with what you learned or how it applies to this role. Aim for 60–90 seconds.",
    mistakes: ["Saying 'we' throughout", "No number or outcome", "Re-reading the line instead of explaining it"],
  }));
  return [...CV_GENERIC, ...fromCv];
}
