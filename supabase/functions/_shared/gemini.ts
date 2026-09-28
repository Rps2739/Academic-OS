// Gemini-based timetable extraction for the automated ingest path
// (design manual §4.4) — the deterministic grid parser in
// packages/core/src/timetable/normalize.ts only understands the one
// exact SIBM xlsx layout it was built against, and can't run inside a
// Deno Edge Function without porting the whole slot/merge-anchored
// grid-reading logic. Gemini instead handles whatever shape the college
// actually emails (a clean .xlsx, a forwarded PDF, a scanned image),
// uniformly, via its multimodal file input.
//
// Deliberately asked for day+HH:MM rather than a final UTC timestamp —
// timezone math (IST -> UTC) is easy to get subtly wrong and was already
// a real bug once in the deterministic parser; keeping it in our own
// tested code (see toUtcIso below) rather than trusting the model with
// it is safer than it looks.
// gemini-2.5-flash was retired (confirmed via a live 404 from the API
// itself on 2026-09-04, naming this as its replacement) — the API's own
// error message is more current than any hardcoded assumption here, so
// trust a future retirement error the same way if this needs updating
// again.
const MODEL = "gemini-3.6-flash";

export interface ExtractedSession {
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  startTime: string; // "HH:MM", 24-hour
  endTime: string; // "HH:MM", 24-hour
  subjectLabel: string;
  faculty: string | null;
  sessionType: string | null;
}

export interface ExtractionResult {
  weekStart: string; // YYYY-MM-DD, the Monday of the timetable's week
  sessions: ExtractedSession[];
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    weekStart: {
      type: "STRING",
      description: "The Monday of this timetable's week, as YYYY-MM-DD.",
    },
    sessions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "STRING", enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] },
          startTime: { type: "STRING", description: "24-hour HH:MM, local time as printed on the sheet" },
          endTime: { type: "STRING", description: "24-hour HH:MM, local time as printed on the sheet" },
          subjectLabel: { type: "STRING" },
          faculty: { type: "STRING", nullable: true },
          sessionType: { type: "STRING", nullable: true, description: "e.g. 'Session 12', or null for a non-class event" },
        },
        required: ["day", "startTime", "endTime", "subjectLabel"],
      },
    },
  },
  required: ["weekStart", "sessions"],
};

const PROMPT = `This is a weekly academic timetable for an MBA program. Extract every scheduled item (classes, sessions, and named events like celebrations or drives) into the given JSON schema.

Rules:
- weekStart is the Monday of the week this timetable covers.
- day is the actual weekday the item falls on.
- startTime/endTime are 24-hour HH:MM, exactly as printed (convert 12-hour AM/PM labels to 24-hour, but do not adjust for timezone — just transcribe the wall-clock time shown).
- subjectLabel is the short course/event name as printed (e.g. "TM (AG)", "Onam Celebration"), not the expanded course title.
- sessionType is the session number label if printed (e.g. "Session 20"), or null if this is a named event with no session number.
- faculty is the instructor's name if shown for this slot, or null.
- A single wide merged cell spanning multiple time slots is one session with the full merged time range — do not split it into multiple sessions.
- Skip empty/unscheduled cells.`;

const MAX_ATTEMPTS = 4;

// 429 (rate limit) and 503 (transient overload — "high demand, try again
// later") are both worth a retry with backoff; a burst of ~20 requests
// in one watcher run against a fresh API key's low per-minute quota hit
// this in practice on the first real run. Anything else (bad request,
// auth, retired model) won't be fixed by waiting, so fail immediately.
async function requestWithRetry(base64Data: string, mimeType: string, apiKey: string) {
  let lastErrorText = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64Data } }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (res.ok) return res.json();

    lastErrorText = await res.text();
    if ((res.status === 429 || res.status === 503) && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      continue;
    }
    throw new Error(`Gemini extraction request failed: ${lastErrorText}`);
  }
  throw new Error(`Gemini extraction request failed after ${MAX_ATTEMPTS} attempts: ${lastErrorText}`);
}

export async function extractTimetableWithGemini(
  base64Data: string,
  mimeType: string,
  apiKey: string
): Promise<ExtractionResult> {
  const data = await requestWithRetry(base64Data, mimeType, apiKey);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`Gemini returned no extractable content: ${JSON.stringify(data)}`);
  }

  const parsed = JSON.parse(text) as ExtractionResult;
  if (!parsed.weekStart || !Array.isArray(parsed.sessions)) {
    throw new Error(`Gemini output didn't match the expected shape: ${text}`);
  }
  return parsed;
}

const DAY_INDEX: Record<ExtractedSession["day"], number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** Same IST-wall-clock -> genuine-UTC conversion as normalizeTimetableGrid. */
export function toUtcIso(weekStart: string, day: ExtractedSession["day"], hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(weekStart + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + DAY_INDEX[day]);
  d.setUTCHours(0, h * 60 + m - IST_OFFSET_MINUTES, 0, 0);
  return d.toISOString();
}

/** Thrown on HTTP 429. GD Prep deliberately does NOT retry (unlike the
 * timetable path above): a skipped scheduled scan costs nothing, and retrying
 * against an exhausted free-tier quota would only burn more of it. */
export class GeminiRateLimitError extends Error {}

/** One structured-output call; returns the parsed JSON (still untrusted —
 * callers validate it). The key goes in a header, not the URL, so it
 * can't end up in any request log. */
export async function generateJson(prompt: string, schema: unknown, apiKey: string): Promise<unknown> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  if (res.status === 429) throw new GeminiRateLimitError("Gemini rate limit reached");
  if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini returned no content");
  return JSON.parse(text);
}
