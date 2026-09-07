-- User's stock/mutual-fund watchlist (Markets tab, added 2026-09-07). Synced
-- so the watchlist follows the user across devices; price/candle data itself
-- is never stored here — it's fetched live from markets-fetch on demand.
create table watchlist_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  symbol text not null,
  kind text not null check (kind in ('stock', 'mf')),
  display_name text,
  scheme_code text,
  sort_order real not null default 0
);

create trigger watchlist_items_set_updated_at before update on watchlist_items
  for each row execute function set_updated_at();

create index watchlist_items_user_updated_idx on watchlist_items (user_id, updated_at);

alter table watchlist_items enable row level security;
create policy watchlist_items_owner on watchlist_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
