-- Bookmarked news articles (News dashboard, added 2026-09-07). A synced
-- table since these are real user data that should reach the phone later --
-- unlike the news cache itself, which is local-only and re-fetchable.
create table saved_articles (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  title text not null,
  link text not null,
  source text,
  summary text,
  category text,
  published_at timestamptz,
  note text
);

create trigger saved_articles_set_updated_at before update on saved_articles
  for each row execute function set_updated_at();

create index saved_articles_user_updated_idx on saved_articles (user_id, updated_at);

alter table saved_articles enable row level security;
create policy saved_articles_owner on saved_articles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
