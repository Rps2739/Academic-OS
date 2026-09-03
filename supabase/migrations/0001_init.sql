-- Academic OS — initial schema (design manual §6)
-- Every user table: id, user_id, created_at, updated_at, deleted_at.
-- updated_at is owned exclusively by the trigger below; the sync engine
-- depends on that guarantee (packages/core/src/sync/engine.ts).

create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================ nodes ======
-- The entire notes hierarchy in one self-referencing table. Arbitrary depth
-- falls out for free; no materialised path column (see manual §6) — subtree
-- queries go through node_subtree()/node_breadcrumbs() below instead.
create table nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  parent_id uuid references nodes(id) on delete cascade,
  kind text not null check (kind in ('folder', 'page')),
  title text not null default 'Untitled',
  icon text,
  sort_order double precision not null default 0
);
create trigger nodes_set_updated_at before update on nodes
  for each row execute function set_updated_at();
create index nodes_user_parent_idx on nodes (user_id, parent_id) where deleted_at is null;
create index nodes_user_updated_idx on nodes (user_id, updated_at);

create or replace function node_subtree(root uuid) returns setof uuid
language sql stable as $$
  with recursive sub as (
    select id from nodes where id = root
    union all
    select n.id from nodes n join sub s on n.parent_id = s.id
  )
  select id from sub;
$$;

create or replace function node_breadcrumbs(leaf uuid) returns table (id uuid, title text, depth int)
language sql stable as $$
  with recursive up as (
    select n.id, n.title, n.parent_id, 0 as depth from nodes n where n.id = leaf
    union all
    select n.id, n.title, n.parent_id, up.depth + 1 from nodes n join up on n.id = up.parent_id
  )
  select id, title, depth from up order by depth desc;
$$;

-- ========================================================== subjects =====
create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  code text,
  term text,
  node_id uuid references nodes(id) on delete set null,
  -- Alternate spellings the timetable has used for this subject. The
  -- normaliser (Phase 4) matches against these and appends new ones it resolves.
  aliases text[] not null default '{}'
);
create trigger subjects_set_updated_at before update on subjects
  for each row execute function set_updated_at();

-- ========================================================== projects =====
-- Case competitions. Created before tasks — tasks.project_id references it.
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  kind text not null default 'case_comp',
  stage text,
  deadline timestamptz,
  team jsonb not null default '[]',
  node_id uuid references nodes(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'done', 'archived'))
);
create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();

-- ======================================================== page_bodies ====
-- 1:1 with a node. `blocks` is the source of truth (the BlockNote/
-- ProseMirror document); `markdown`/`plaintext` are a client-computed cache
-- — BlockNote's markdown conversion runs on a live editor instance and
-- cannot be derived server-side, so the desktop sends all three on save.
-- user_id is denormalised here (not just joined via node_id) so RLS can
-- apply directly — see manual §6 "RLS" note.
create table page_bodies (
  node_id uuid primary key references nodes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocks jsonb not null default '[]',
  markdown text not null default '',
  plaintext text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger page_bodies_set_updated_at before update on page_bodies
  for each row execute function set_updated_at();
create index page_bodies_plaintext_fts_idx on page_bodies using gin (to_tsvector('english', plaintext));

-- The safety net behind last-write-wins sync: every save's losing side (or,
-- once desktop editing lands, every save period) is archived here, never
-- discarded. Append-only — no updated_at/deleted_at needed.
create table page_versions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references nodes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocks jsonb not null,
  markdown text,
  device_id text not null,
  created_at timestamptz not null default now()
);
create index page_versions_node_idx on page_versions (node_id, created_at desc);

-- ============================================================= tasks =====
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  title text not null,
  notes text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  priority int not null default 0,
  completed_at timestamptz,
  sort_order double precision not null default 0,
  node_id uuid references nodes(id) on delete set null,
  project_id uuid references projects(id) on delete set null
);
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();
create index tasks_user_due_idx on tasks (user_id, due_at) where deleted_at is null;

-- ======================================================== attachments ====
-- Hangs off ANY node (folders included), so a subject folder can hold
-- files without them belonging to a specific page.
create table attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  node_id uuid not null references nodes(id) on delete cascade,
  drive_file_id text,
  filename text not null,
  mime text,
  size_bytes bigint,
  extracted_text text,
  local_path text,
  ocr_status text not null default 'skipped'
    check (ocr_status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  capture_group_id uuid,
  capture_index int
);
create trigger attachments_set_updated_at before update on attachments
  for each row execute function set_updated_at();
create index attachments_node_idx on attachments (node_id) where deleted_at is null;
create index attachments_capture_group_idx on attachments (capture_group_id, capture_index)
  where capture_group_id is not null;

-- =================================================== timetable_imports ===
create table timetable_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source text not null check (source in ('apps_script', 'manual_upload', 'forward_poll')),
  source_message_id text,
  received_at timestamptz not null,
  week_start date not null,
  raw jsonb not null,
  checksum text not null,
  parsed_ok boolean not null default false,
  parse_error text,
  superseded_by uuid references timetable_imports(id)
);
create trigger timetable_imports_set_updated_at before update on timetable_imports
  for each row execute function set_updated_at();
-- Idempotency guarantee: a re-running Apps Script trigger cannot duplicate
-- an import. Do not remove this index.
create unique index timetable_imports_user_checksum_idx on timetable_imports (user_id, checksum);

-- ===================================================== class_sessions ====
create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  import_id uuid references timetable_imports(id) on delete cascade,
  week_start date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  subject_id uuid references subjects(id) on delete set null,
  subject_label text not null,
  faculty text,
  room text,
  session_type text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'superseded')),
  gcal_event_id text
);
create trigger class_sessions_set_updated_at before update on class_sessions
  for each row execute function set_updated_at();
create index class_sessions_user_starts_idx on class_sessions (user_id, starts_at);

-- =================================================== attendance_marks ====
-- A manual ledger, not a Moodle mirror — see manual §8 Phase 6. Present/
-- Absent per session, typed in by hand.
create table attendance_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  subject_id uuid not null references subjects(id) on delete cascade,
  class_session_id uuid references class_sessions(id) on delete set null,
  marked_for date not null,
  state text not null check (state in ('present', 'absent'))
);
create trigger attendance_marks_set_updated_at before update on attendance_marks
  for each row execute function set_updated_at();
create unique index attendance_marks_session_idx on attendance_marks (class_session_id)
  where class_session_id is not null and deleted_at is null;

-- ========================================================= embeddings ====
-- Server-generated and server-only (Phase 5). Never part of the client
-- sync engine — see packages/core/src/sync/tables.ts.
create table embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('page', 'attachment')),
  source_id uuid not null,
  chunk_index int not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);
create index embeddings_hnsw_idx on embeddings using hnsw (embedding vector_cosine_ops);
create index embeddings_source_idx on embeddings (source_type, source_id);

-- ======================================================= user_settings ===
-- One row per user. Read/written directly via the API — not part of the
-- offline sync engine. Secrets are Vault references/hashes only.
create table user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  drive_folder_id text,
  gcal_calendar_id text,
  ingest_secret_hash text,
  gemini_key_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_settings_set_updated_at before update on user_settings
  for each row execute function set_updated_at();

-- ================================================================ RLS ====
-- One owner policy per table, identical shape. Single-user app, but this
-- is what makes the private repo's fixtures and the hosted DB safe by
-- construction rather than by care.
alter table nodes enable row level security;
create policy nodes_owner on nodes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table subjects enable row level security;
create policy subjects_owner on subjects for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table projects enable row level security;
create policy projects_owner on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table page_bodies enable row level security;
create policy page_bodies_owner on page_bodies for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table page_versions enable row level security;
create policy page_versions_owner on page_versions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table tasks enable row level security;
create policy tasks_owner on tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table attachments enable row level security;
create policy attachments_owner on attachments for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table timetable_imports enable row level security;
create policy timetable_imports_owner on timetable_imports for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table class_sessions enable row level security;
create policy class_sessions_owner on class_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table attendance_marks enable row level security;
create policy attendance_marks_owner on attendance_marks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table embeddings enable row level security;
create policy embeddings_owner on embeddings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table user_settings enable row level security;
create policy user_settings_owner on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
