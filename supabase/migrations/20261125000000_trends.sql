-- Trends and check-in: the extra logs from the live app.
-- Wellness: every other number intervals.icu holds for the day (custom fields and watch/scale values), kept as-is.
alter table public.wellness add column if not exists extra jsonb not null default '{}'::jsonb;

-- Check-in: mental clarity 1-5, optional libido 0-7, caffeine, alcohol, morning temperature, and the sore/injury body map.
alter table public.checkins add column if not exists clarity smallint check (clarity between 1 and 5);
alter table public.checkins add column if not exists libido smallint check (libido between 0 and 7);
alter table public.checkins add column if not exists caffeine real check (caffeine between 0 and 1500);
alter table public.checkins add column if not exists alcohol real check (alcohol between 0 and 30);
alter table public.checkins add column if not exists body_temp real check (body_temp between 34 and 42);
alter table public.checkins add column if not exists body jsonb;

-- Libido is an opt-in log: off until the person turns it on.
alter table public.profiles add column if not exists libido_log boolean not null default false;
grant update (libido_log) on public.profiles to authenticated;
