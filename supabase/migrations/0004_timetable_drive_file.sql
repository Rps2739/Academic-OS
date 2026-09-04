-- Stores the original uploaded/received timetable file in the user's
-- Google Drive (drive-upload Edge Function, same as note attachments) so
-- the archive view can offer the original spreadsheet, not just the
-- parsed sessions.
alter table timetable_imports add column drive_file_id text;
alter table timetable_imports add column original_filename text;
