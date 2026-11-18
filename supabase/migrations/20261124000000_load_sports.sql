-- Load tab redesign: every intervals.icu activity type is its own sport (Cycling and Running group their types),
-- and the calendar's tests, races and events are kept for the projection target and chart marks.
alter table public.daily_load drop constraint if exists daily_load_sport_check;
alter table public.daily_load add constraint daily_load_sport_check check (char_length(sport) between 1 and 40);

create table if not exists public.calendar_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  day date not null,
  kind text not null,                     -- FTP test, VO2 test, Durability test, Race A/B/C, Event
  name text,
  primary key (user_id, id)
);
alter table public.calendar_items enable row level security;
drop policy if exists "own calendar items" on public.calendar_items;
create policy "own calendar items" on public.calendar_items for select using (auth.uid() = user_id);
grant select on public.calendar_items to authenticated;
grant all on public.calendar_items to service_role;

-- Per-account Load preferences: default sport tab and which sports count in Combined
create table if not exists public.user_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 40),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_prefs enable row level security;
drop policy if exists "own prefs" on public.user_prefs;
create policy "own prefs" on public.user_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.user_prefs to authenticated;
grant all on public.user_prefs to service_role;
