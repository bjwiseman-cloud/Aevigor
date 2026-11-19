-- Round 2 of the rebuild (Ben's tweak list 3):
-- * Profile: thresholds and zones per sport, copied from intervals.icu at each sync (server-written, read-only in the app).
-- * Records: female-only tests (mammogram, Pap test) in Labs and diagnostics.
-- * Cycle tracking (opt-in, health data): period days, flow and symptom chips, life stage and contraception type.
--   Log only. Phases shown in the app are estimates from the person's own logged dates; no fertility predictions.

alter table public.profiles add column if not exists athlete jsonb;

alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('blood', 'urine', 'dexa', 'ecg', 'imaging', 'mammogram', 'pap', 'other'));

create table if not exists public.cycle_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  tracking boolean not null default true,
  life_stage text not null default 'regular'
    check (life_stage in ('regular', 'irregular', 'pregnant', 'postpartum', 'perimenopause', 'menopause')),
  contraception text check (char_length(contraception) <= 60),
  hormonal boolean,
  updated_at timestamptz not null default now()
);

create table if not exists public.cycle_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  period boolean not null default false,
  flow text check (flow in ('spotting', 'light', 'medium', 'heavy')),
  symptoms text[] not null default '{}' check (cardinality(symptoms) <= 20),
  note text check (char_length(note) <= 500),
  primary key (user_id, day)
);

do $$
declare t text;
begin
  foreach t in array array['cycle_settings', 'cycle_days'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows read" on public.%I', t);
    execute format('drop policy if exists "own rows write" on public.%I', t);
    execute format('create policy "own rows read" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own rows write" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id and public.has_health_consent())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

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
  delete from public.cycle_days where user_id = auth.uid();
  delete from public.cycle_settings where user_id = auth.uid();
  update public.profiles set health_consent_at = null where user_id = auth.uid();
end $$;
revoke execute on function public.delete_my_health_data() from public, anon;
grant execute on function public.delete_my_health_data() to authenticated;
