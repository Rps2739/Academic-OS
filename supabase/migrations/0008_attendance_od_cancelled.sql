-- Widen attendance_marks.state to add "od" (on-duty — counts as present
-- for the attendance %, per standard college policy) and "cancelled" (the
-- class didn't happen — excluded from both numerator and denominator).
-- Requested by the user; the original design manual explicitly scoped
-- attendance to present/absent only, but real usage needs these two.
alter table attendance_marks drop constraint if exists attendance_marks_state_check;
alter table attendance_marks add constraint attendance_marks_state_check
  check (state in ('present', 'absent', 'od', 'cancelled'));
