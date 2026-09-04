-- Each task category (a folder node) gets its own Google Tasks list —
-- "Academic OS — SIBM", "Academic OS — Personal", etc. — rather than a
-- bracketed prefix jammed into every task title. Uncategorized tasks
-- keep using the existing default list (user_settings.gtasks_list_id).

alter table nodes add column google_tasklist_id text;

-- A task can move between lists (its category changes), so unlike
-- google_task_id this isn't derivable from a single fixed list — the
-- sync function needs to know exactly which list a task currently lives
-- in to PATCH/DELETE the right one.
alter table tasks add column google_tasklist_id text;
