-- Load and Trends pages: daily training load per sport (actual and planned) and planned test days.
-- Written by the server during sync; each person can only read their own rows.
create table if not exists public.daily_load (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sport text not null check (sport in ('ride', 'run', 'other')),
  actual real not null default 0,
  planned real not null default 0,
  rpe real,
  sessions smallint not null default 0,
  primary key (user_id, day, sport)
);
alter table public.daily_load enable row level security;
create policy "read own load" on public.daily_load for select using (auth.uid() = user_id);

create table if not exists public.planned_tests (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null,
  name text,
  primary key (user_id, day, kind)
);
alter table public.planned_tests enable row level security;
create policy "read own tests" on public.planned_tests for select using (auth.uid() = user_id);

revoke insert, update, delete on public.daily_load, public.planned_tests from authenticated, anon;
