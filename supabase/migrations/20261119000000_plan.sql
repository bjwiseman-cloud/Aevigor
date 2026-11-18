-- Plan tab: My log (supplements, hormones, peptides, medications, meal timing), reminder groups,
-- appointments and tests, health records (labs, DEXA, ECG, imaging), blood pressure, and card layouts.
--
-- Rules (Ben's compliance guardrail): this is a personal log. People enter their own items, amounts and reminders;
-- the app never suggests doses, never interprets results, and lab flags are copied exactly as printed on the report.
-- Health data needs its own opt-in (profiles.health_consent_at). It is private to each person (Row Level Security),
-- never shared, and can be deleted at any time with public.delete_my_health_data().

-- ---------- Separate health-data consent ----------
alter table public.profiles add column if not exists health_consent_at timestamptz;
grant update (health_consent_at) on public.profiles to authenticated;

create or replace function public.has_health_consent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and health_consent_at is not null)
$$;
revoke execute on function public.has_health_consent() from public, anon;
grant execute on function public.has_health_consent() to authenticated;

-- ---------- Reminder groups (one reminder for several items, e.g. "Night routine") ----------
create table if not exists public.log_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  rrule text not null default 'FREQ=DAILY',          -- iCal repeat rule (RFC 5545), the same format calendars use
  times text[] not null default '{21:00}',            -- local HH:MM
  reminder boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Items people take or do on a schedule ----------
create table if not exists public.log_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('supplement', 'hormone', 'peptide', 'medication', 'meal')),
  name text not null check (char_length(name) between 1 and 120),
  strength text check (char_length(strength) <= 60),  -- from the product label / database, e.g. "1,000 IU"
  form text check (char_length(form) <= 40),          -- tablet, capsule, injection…
  amount numeric check (amount >= 0),                 -- what the person says they take; never suggested by the app
  unit text check (char_length(unit) <= 20),
  rrule text not null default 'FREQ=DAILY',           -- 'AS_NEEDED' for as-needed items
  times text[] not null default '{08:00}',
  start_date date not null default current_date,
  end_date date,
  notes text check (char_length(notes) <= 1000),
  reminder boolean not null default true,
  group_id uuid references public.log_groups (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists log_items_user on public.log_items (user_id);

-- ---------- Taken / skipped marks (plain log, no judgement) ----------
create table if not exists public.log_doses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.log_items (id) on delete cascade,
  day date not null,
  slot text not null,                                 -- the scheduled HH:MM, or 'extra' for as-needed
  status text not null check (status in ('taken', 'skipped')),
  logged_at timestamptz not null default now(),
  unique (item_id, day, slot)
);
create index if not exists log_doses_user_day on public.log_doses (user_id, day);

-- ---------- Appointments, medical appointments, tests, races ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('medical', 'lab', 'fitness_test', 'race', 'physio', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  starts_at timestamptz not null,
  location text check (char_length(location) <= 200),
  description text check (char_length(description) <= 2000),
  prep_notes text check (char_length(prep_notes) <= 1000),
  remind_minutes integer[] not null default '{1440}', -- minutes before: 1440 = day before, 60 = 1 h before
  rrule text,                                          -- null = one-off
  on_external_calendars boolean not null default false, -- medical items stay off outside calendars unless opted in
  created_at timestamptz not null default now()
);
create index if not exists events_user_start on public.events (user_id, starts_at);

-- ---------- Health records (Labs and diagnostics) ----------
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('blood', 'urine', 'dexa', 'ecg', 'imaging', 'other')),
  day date not null,
  title text check (char_length(title) <= 120),
  source text check (char_length(source) <= 120),     -- lab or clinic, e.g. "Dynalife"
  notes text check (char_length(notes) <= 2000),
  files text[] not null default '{}',                 -- paths in the private "records" storage bucket
  created_at timestamptz not null default now()
);
create index if not exists records_user_day on public.records (user_id, day);

create table if not exists public.lab_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  record_id uuid not null references public.records (id) on delete cascade,
  marker text not null check (char_length(marker) between 1 and 80),
  value_num numeric,
  value_text text check (char_length(value_text) <= 60), -- e.g. "Negative"
  unit text check (char_length(unit) <= 30),
  range_text text check (char_length(range_text) <= 60), -- the report's own range, as printed
  flag text check (flag in ('Below', 'Normal', 'High')) -- copied from the report, never computed
);
create index if not exists lab_values_user_marker on public.lab_values (user_id, marker);

-- ---------- Blood pressure ----------
create table if not exists public.bp_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  taken_at timestamptz not null default now(),
  systolic smallint not null check (systolic between 50 and 260),
  diastolic smallint not null check (diastolic between 30 and 180),
  pulse smallint check (pulse between 20 and 250),
  source text not null default 'manual' check (source in ('manual', 'health_connect', 'apple_health', 'import'))
);
create index if not exists bp_user_time on public.bp_readings (user_id, taken_at);

-- ---------- Card order and hidden cards per page (Edit layout) ----------
create table if not exists public.ui_layout (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page text not null check (char_length(page) <= 40),
  card_order text[] not null default '{}',
  hidden text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, page)
);

-- ---------- Privacy walls ----------
-- Health tables: own rows only, and writing needs the separate health-data opt-in.
do $$
declare t text;
begin
  foreach t in array array['log_groups', 'log_items', 'log_doses', 'events', 'records', 'lab_values', 'bp_readings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows read" on public.%I', t);
    execute format('drop policy if exists "own rows write" on public.%I', t);
    execute format('create policy "own rows read" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own rows write" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id and public.has_health_consent())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Appointments and tests are not all health data, but they share the opt-in for simplicity during the beta.

alter table public.ui_layout enable row level security;
drop policy if exists "own layout" on public.ui_layout;
create policy "own layout" on public.ui_layout for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.ui_layout to authenticated;
revoke all on public.ui_layout from anon;

-- ---------- Private file storage for records (PDFs, photos, scans) ----------
-- Files live under records/<user id>/..., and only that person can read or write them.
insert into storage.buckets (id, name, public, file_size_limit)
values ('records', 'records', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "records own files read" on storage.objects;
drop policy if exists "records own files write" on storage.objects;
drop policy if exists "records own files delete" on storage.objects;
create policy "records own files read" on storage.objects for select to authenticated
  using (bucket_id = 'records' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "records own files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'records' and (storage.foldername(name))[1] = auth.uid()::text and public.has_health_consent());
create policy "records own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'records' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- "Delete my health data" button ----------
-- The app first removes the person's files through the Storage API (Supabase does not allow deleting
-- storage.objects rows directly), then calls this to remove every health row and the opt-in.
create or replace function public.delete_my_health_data()
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from public.lab_values where user_id = auth.uid();
  delete from public.records where user_id = auth.uid();
  delete from public.bp_readings where user_id = auth.uid();
  delete from public.log_doses where user_id = auth.uid();
  delete from public.log_items where user_id = auth.uid();
  delete from public.log_groups where user_id = auth.uid();
  delete from public.events where user_id = auth.uid();
  update public.profiles set health_consent_at = null where user_id = auth.uid();
end $$;
revoke execute on function public.delete_my_health_data() from public, anon;
grant execute on function public.delete_my_health_data() to authenticated;

-- Explicit server access (the project has no automatic table grants); RLS still applies to app users.
grant all on public.log_groups, public.log_items, public.log_doses, public.events, public.records,
  public.lab_values, public.bp_readings, public.ui_layout to service_role;
