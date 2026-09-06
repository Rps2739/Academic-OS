-- Lets a project (case comp / group project) be linked to the subject
-- it belongs to, so Subjects can show "projects and deadlines for this
-- subject" without guessing from names. Nullable — most projects still
-- won't belong to a single subject.
alter table projects add column subject_id uuid references subjects(id);
