import { z } from "zod";
import { syncableBase } from "./base";

export const attendanceState = z.enum(["present", "absent", "od", "cancelled"]);
export type AttendanceState = z.infer<typeof attendanceState>;

/**
 * A manual ledger — Present/Absent/OD/Cancelled per session, typed in by
 * hand. Moodle remains the official record; this is only the user's own
 * running tally. No Moodle integration. "od" (on-duty) counts as present
 * for the attendance %; "cancelled" (the class didn't happen) is excluded
 * from both numerator and denominator — see attendancePct in
 * SubjectsView.tsx/HomeView.tsx.
 */
export const attendanceMarkSchema = syncableBase.extend({
  subject_id: z.string().uuid(),
  class_session_id: z.string().uuid().nullable(),
  marked_for: z.string().date(),
  state: attendanceState,
});

export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;
