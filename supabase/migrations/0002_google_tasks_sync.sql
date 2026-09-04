-- Google Tasks two-way sync. tasks.google_task_id maps a local task to
-- its counterpart in a dedicated Google Tasks list (created on first
-- sync); user_settings.gtasks_list_id remembers which list that is, same
-- pattern as drive_folder_id / gcal_calendar_id.

alter table tasks add column google_task_id text;
create unique index tasks_google_task_id_idx on tasks (user_id, google_task_id)
  where google_task_id is not null;

alter table user_settings add column gtasks_list_id text;
