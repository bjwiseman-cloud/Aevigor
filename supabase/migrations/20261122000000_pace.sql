-- Running pace curves from intervals.icu: best time (secs) for each distance (meters).
create table if not exists public.pace_curves (
  user_id uuid not null references auth.users (id) on delete cascade,
  curve text not null,                    -- intervals.icu curve id: 84d, 1y, all
  label text,
  meters numeric[] not null,
  secs int[] not null,
  activity_ids text[],
  critical_speed numeric,                 -- m/s, from intervals.icu's critical speed model
  d_prime numeric,                        -- meters
  synced_at timestamptz not null default now(),
  primary key (user_id, curve)
);

alter table public.pace_curves enable row level security;
drop policy if exists "own pace curves" on public.pace_curves;
create policy "own pace curves" on public.pace_curves for select using (auth.uid() = user_id);

grant select on public.pace_curves to authenticated;
grant all on public.pace_curves to service_role;
