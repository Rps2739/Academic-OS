import { z } from "zod";
import { syncableBase } from "./base";

export const attendanceState = z.enum(["present", "absent"]);
export type AttendanceState = z.infer<typeof attendanceState>;

/**
 * A manual ledger — Present/Absent per session, typed in by hand. Moodle
 * remains the official record; this is only the user's own running tally.
 * No forecasting, no on-duty state, no Moodle integration. See §8 Phase 6.
 */
export const attendanceMarkSchema = syncableBase.extend({
  subject_id: z.string().uuid(),
  class_session_id: z.string().uuid().nullable(),
  marked_for: z.string().date(),
  state: attendanceState,
});

export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;
