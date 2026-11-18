-- Aevigor private beta: tables, privacy walls (Row Level Security) and the invite-only sign-up gate.
-- Every table holding a person's data has RLS on, so the database itself refuses to show one person's rows to anyone else.

-- ---------- Invite list ----------
-- Only these email addresses can create an account. Add people with:
--   insert into public.invites (email, note) values ('friend@example.com', 'from waitlist');
create table if not exists public.invites (
  email text primary key check (email = lower(email)),
  note text,
  invited_at timestamptz not null default now()
);
alter table public.invites enable row level security;  -- no policies: only the server and the dashboard can read it

-- ---------- Profiles ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  time_zone text not null default 'America/Edmonton',
  consent_version text,
  consent_at timestamptz,
  intervals_athlete_id text,
  intervals_connected_at timestamptz,
  last_sync timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select using (auth.uid() = user_id);
-- People may only change these columns themselves; the rest is set by the server.
create policy "update own profile" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.profiles from authenticated, anon;
grant update (display_name, time_zone, consent_version, consent_at) on public.profiles to authenticated;

-- ---------- intervals.icu keys (encrypted, never readable from the app) ----------
create table if not exists public.intervals_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key_cipher text not null,        -- AES-GCM, encrypted by the edge function with BETA_ENCRYPTION_KEY
  updated_at timestamptz not null default now()
);
alter table public.intervals_secrets enable row level security;  -- no policies: server only
revoke all on public.intervals_secrets from authenticated, anon;

-- ---------- Wellness from intervals.icu (one row per person per day) ----------
create table if not exists public.wellness (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  hrv real, resting_hr real, sleep_secs integer,
  sleep_quality smallint, fatigue smallint, soreness smallint, stress smallint, mood smallint, motivation smallint,
  synced_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.wellness enable row level security;
create policy "read own wellness" on public.wellness for select using (auth.uid() = user_id);

-- ---------- Daily check-ins ----------
create table if not exists public.checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sleep_quality smallint check (sleep_quality between 1 and 4),
  fatigue smallint check (fatigue between 1 and 4),
  soreness smallint check (soreness between 1 and 4),
  stress smallint check (stress between 1 and 4),
  mood smallint check (mood between 1 and 4),
  motivation smallint check (motivation between 1 and 4),
  sick text check (sick in ('No', 'Mild', 'Yes')),
  notes text check (char_length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.checkins enable row level security;
create policy "read own checkins" on public.checkins for select using (auth.uid() = user_id);

-- ---------- Daily status (computed by the server) ----------
create table if not exists public.daily_status (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  status text not null,
  weekly text not null,
  weekly_why text,
  reasons jsonb not null default '[]',
  signals jsonb not null default '{}',
  load jsonb,
  rules_version text,
  computed_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_status enable row level security;
create policy "read own status" on public.daily_status for select using (auth.uid() = user_id);

-- Nothing in these tables is written from the app directly: writes go through the edge function.
revoke insert, update, delete on public.wellness, public.checkins, public.daily_status from authenticated, anon;

-- ---------- Invite-only sign-up gate ----------
-- 1) Auth hook (Dashboard > Authentication > Hooks > "Before User Created" > Postgres function public.hook_before_user_created).
--    Gives a friendly message to anyone not on the invite list, for email and Google sign-ups alike.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if e <> '' and exists (select 1 from public.invites where email = e) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Aevigor is invite-only during the beta. Join the waitlist at aevigor.com.'));
end $$;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;

-- 2) Backstop if the hook is ever switched off: refuses to create the account at all.
create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.invites where email = lower(new.email)) then
    raise exception 'Aevigor is invite-only during the beta';
  end if;
  insert into public.profiles (user_id, email, display_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists aevigor_on_auth_user_created on auth.users;
create trigger aevigor_on_auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();
