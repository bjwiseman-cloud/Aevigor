-- Performance and Sessions: one summary row per intervals.icu activity, plus the athlete's power curves.
-- Written only by the server (sync); each person can read only their own rows.
create table if not exists public.activities (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  day date not null,
  start_local text,
  type text not null default 'Other',
  name text,
  moving_time numeric,
  distance numeric,
  load numeric,
  raw jsonb not null default '{}',        -- every scalar field intervals.icu sent (power, HR, EF, decoupling, RPE...)
  best jsonb,                             -- best watts at standard durations, e.g. {"5": 900, "300": 340}
  primary key (user_id, id)
);
create index if not exists activities_user_day on public.activities (user_id, day);

create table if not exists public.power_curves (
  user_id uuid not null references auth.users (id) on delete cascade,
  sport text not null,
  curve text not null,                    -- intervals.icu curve id: s0 (season), 1y, all
  label text,
  secs int[] not null,
  watts int[] not null,
  wkg numeric[],
  activity_ids text[],
  synced_at timestamptz not null default now(),
  primary key (user_id, sport, curve)
);

alter table public.activities enable row level security;
alter table public.power_curves enable row level security;
drop policy if exists "own activities" on public.activities;
create policy "own activities" on public.activities for select using (auth.uid() = user_id);
drop policy if exists "own curves" on public.power_curves;
create policy "own curves" on public.power_curves for select using (auth.uid() = user_id);

-- Explicit grants (the project has no automatic table grants)
grant select on public.activities, public.power_curves to authenticated;
grant all on public.activities, public.power_curves to service_role;
