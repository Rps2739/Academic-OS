import * as XLSX from "xlsx";
import type { RawGrid } from "../schema/timetable";

/**
 * Parses the real SIBM MBA timetable .xlsx layout (design manual §4.2)
 * into class sessions. This is the deterministic path used by the
 * manual-upload screen and its tests — the automated email pipeline
 * (§4.4) uses Gemini instead specifically because that path runs
 * unattended and needs to survive the college changing the layout
 * without a human noticing. This parser is tuned to the real fixture
 * files in samples/ (gitignored — real faculty/room data) and doesn't
 * need that flexibility: if the layout changes, the tests fail loudly
 * and someone updates this file.
 *
 * Real layout, confirmed against actual sheets (not guessed):
 *  - Row 5: title, e.g. "Timetable - 31st August to 5th September 2026
 *    MBA(BA) Sem- III (Batch 2025-27)".
 *  - Row 6: six time-slot labels, each merged across a 2-column pair —
 *    columns 1-2, 3-4, 5-6, [7 is a permanent blank spacer], 8-9,
 *    10-11, 12-13.
 *  - Then six repeating 6-row day-blocks (Mon-Sat): a header row with
 *    the date in column 0 and "Course"/"Session #" captions, followed
 *    by a data row whose six slot cells hold "{ShortName} - {Session#}"
 *    (or a special string like "Onam Celebration", or nothing).
 *  - A slot's value can be merged across MORE than its own 2 columns —
 *    a full-day event like a workshop spans multiple slot-pairs in one
 *    merge. The merge's own column span, not the fixed slot grid, is
 *    what determines its actual start/end time.
 *  - A legend table below the grid maps short name -> full course name
 *    + faculty, used to fill in `faculty` (subject_id resolution against
 *    the app's own `subjects.aliases` happens later, by the caller).
 *
 * Row/column positions below are 0-indexed, matching XLSX.utils.sheet_to_json
 * with `header: 1`.
 */

const SLOT_HEADER_ROW = 6;
const FIRST_DAY_HEADER_ROW = 7;
const DAY_BLOCK_HEIGHT = 6;
const DAY_COUNT = 6; // Mon-Sat
const SLOT_ANCHOR_COLS = [1, 3, 5, 8, 10, 12];
const DATE_COL = 0;

export interface ParsedSession {
  weekStart: string; // yyyy-mm-dd, the Monday of the week
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
  subjectLabel: string;
  faculty: string | null;
  sessionType: string | null;
}

export interface ParseResult {
  weekStart: string;
  sessions: ParsedSession[];
  warnings: string[];
}

interface CellMerge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

/**
 * The sheet only ever marks AM/PM once, on the END of each range (e.g.
 * "11:00 -12:15PM" is 11:00 AM to 12:15 PM — the START has no marker of
 * its own and must be inferred). A single isPM flag applied to both ends
 * breaks exactly that slot, the one that crosses noon. Infer each side
 * independently from its own hour when unmarked: 8-11 reads as AM,
 * 12 as PM (noon), 1-7 as PM (these are all afternoon/evening class
 * slots in a day schedule that runs 9:30 to 6:45).
 */
function inferMeridiem(hour: number): "AM" | "PM" {
  if (hour === 12) return "PM";
  if (hour >= 8 && hour <= 11) return "AM";
  return "PM";
}

function to24Hour(hour: number, meridiem: "AM" | "PM"): number {
  if (meridiem === "AM") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

/** "9:30-10:45AM" / "11:00 -12:15PM" / "12:30\n-1:45PM" -> minutes since midnight. */
function parseTimeLabel(label: string): TimeRange | null {
  const cleaned = label.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  const [, h1, m1, h2, m2, meridiem] = match;
  const startHour = Number(h1);
  const endHour = Number(h2);
  const endMeridiem = (meridiem?.toUpperCase() as "AM" | "PM" | undefined) ?? inferMeridiem(endHour);
  const startMeridiem = inferMeridiem(startHour);
  return {
    startMinutes: to24Hour(startHour, startMeridiem) * 60 + Number(m1),
    endMinutes: to24Hour(endHour, endMeridiem) * 60 + Number(m2),
  };
}

function buildMergeIndex(merges: CellMerge[]): Map<number, CellMerge> {
  const index = new Map<number, CellMerge>();
  for (const m of merges) {
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        index.set(r * 1000 + c, m);
      }
    }
  }
  return index;
}

function cellText(grid: RawGrid, r: number, c: number): string {
  const v = grid[r]?.[c];
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Monday-Saturday for the ISO week containing this date. */
function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `weekStartHint` anchors day 0 (Monday) — pass the workbook's own date
 * cell for the first day-block, parsed with a UTC-safe method by the
 * caller (see parseWorkbook). Passing a plain grid without that context
 * (e.g. from a test fixture) falls back to today's Monday, which is
 * only meant for tests that don't care about the actual calendar date.
 */
export function normalizeTimetableGrid(
  grid: RawGrid,
  merges: CellMerge[],
  weekStartHint?: Date
): ParseResult {
  const warnings: string[] = [];
  const mergeIndex = buildMergeIndex(merges);
  const weekStart = mondayOf(weekStartHint ?? new Date());

  // Legend: Course Name (col 0) | Short Name (col 2) | Faculty Name (col 3),
  // starting the row after "Course Name" appears in column 0.
  const legendByShortName = new Map<string, { faculty: string }>();
  for (let r = 0; r < grid.length; r++) {
    if (cellText(grid, r, 0).toLowerCase() === "course name") {
      for (let lr = r + 1; lr < grid.length; lr++) {
        const shortName = cellText(grid, lr, 2);
        if (!shortName) break;
        legendByShortName.set(shortName.trim(), { faculty: cellText(grid, lr, 3) || "" });
      }
      break;
    }
  }

  // Slot time ranges, from the merged header row.
  const slotTimes = new Map<number, TimeRange>();
  for (const col of SLOT_ANCHOR_COLS) {
    const merge = mergeIndex.get(SLOT_HEADER_ROW * 1000 + col);
    const label = cellText(grid, SLOT_HEADER_ROW, merge?.s.c ?? col);
    const range = parseTimeLabel(label);
    if (range) slotTimes.set(col, range);
    else warnings.push(`Could not parse time label at column ${col}: "${label}"`);
  }

  const sessions: ParsedSession[] = [];

  for (let day = 0; day < DAY_COUNT; day++) {
    const headerRow = FIRST_DAY_HEADER_ROW + day * DAY_BLOCK_HEIGHT;
    const dataRow = headerRow + 1;
    const dayDate = new Date(weekStart);
    dayDate.setUTCDate(dayDate.getUTCDate() + day);
    const dateStr = toISODate(dayDate);

    const handledCols = new Set<number>();
    for (const anchorCol of SLOT_ANCHOR_COLS) {
      if (handledCols.has(anchorCol)) continue;

      const merge = mergeIndex.get(dataRow * 1000 + anchorCol);
      const valueCol = merge?.s.c ?? anchorCol;
      const value = cellText(grid, dataRow, valueCol);

      if (merge) {
        for (let c = merge.s.c; c <= merge.e.c; c++) handledCols.add(c);
      }
      if (!value) continue;

      // A merge spanning multiple slot-pairs (a workshop, a fest) covers
      // every slot's own time range from its first to its last column.
      const spanStart = merge?.s.c ?? anchorCol;
      const spanEnd = merge?.e.c ?? anchorCol;
      const coveredSlots = SLOT_ANCHOR_COLS.filter((c) => c >= spanStart && c <= spanEnd);
      const startRange = slotTimes.get(coveredSlots[0] ?? anchorCol);
      const endRange = slotTimes.get(coveredSlots[coveredSlots.length - 1] ?? anchorCol);
      if (!startRange || !endRange) {
        warnings.push(`No time range resolved for "${value}" on ${dateStr}`);
        continue;
      }

      // "ShortName - SessionNumber", e.g. "CBD (JS) - 18". Anything that
      // doesn't match (holidays, named events) is kept as-is with no
      // session number and no legend/faculty lookup.
      const sessionMatch = value.match(/^(.+?)\s*-\s*(\d+)$/);
      const rawLabel = sessionMatch?.[1]?.trim() ?? value;
      const sessionNumber = sessionMatch?.[2] ?? null;
      const legend = legendByShortName.get(rawLabel);
      if (sessionMatch && !legend) {
        warnings.push(`"${rawLabel}" on ${dateStr} has no matching row in the course legend`);
      }

      const startsAt = new Date(weekStart);
      startsAt.setUTCDate(startsAt.getUTCDate() + day);
      startsAt.setUTCHours(0, startRange.startMinutes, 0, 0);
      const endsAt = new Date(weekStart);
      endsAt.setUTCDate(endsAt.getUTCDate() + day);
      endsAt.setUTCHours(0, endRange.endMinutes, 0, 0);

      sessions.push({
        weekStart: toISODate(weekStart),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        subjectLabel: rawLabel,
        faculty: legend?.faculty || null,
        sessionType: sessionNumber ? `Session ${sessionNumber}` : null,
      });
    }
  }

  return { weekStart: toISODate(weekStart), sessions, warnings };
}

/**
 * Reads an .xlsx File/ArrayBuffer and normalizes it. The workbook's own
 * first day-block date cell anchors the week (read via SSF.parse_date_code
 * on the raw numeric serial, NOT JS Date — converting an Excel serial to a
 * JS Date and back through .toISOString() renders in UTC and silently
 * shifts the calendar date by up to a day depending on the sheet's
 * timezone; the raw y/m/d from the serial itself has no such ambiguity).
 */
export function parseTimetableWorkbook(data: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) throw new Error("Workbook has no sheets");
  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as RawGrid;
  const merges = (sheet["!merges"] ?? []) as CellMerge[];

  const dateCell = sheet[XLSX.utils.encode_cell({ r: FIRST_DAY_HEADER_ROW, c: DATE_COL })];
  let weekStartHint: Date | undefined;
  if (dateCell && typeof dateCell.v === "number") {
    const parsed = XLSX.SSF.parse_date_code(dateCell.v);
    if (parsed) weekStartHint = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }

  return normalizeTimetableGrid(grid, merges, weekStartHint);
}
