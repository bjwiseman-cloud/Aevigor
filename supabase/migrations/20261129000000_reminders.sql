-- Morning check-in and Post Activity reminders, by email (from no-reply@aevigor.com) and/or phone alert.
-- Each person opts in (all off by default); the beta admin (Ben) starts with both on by email and phone, as he asked.
create table if not exists public.notify_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  morning_email boolean not null default false,
  morning_push boolean not null default false,
  morning_time text not null default '07:00' check (morning_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  post_email boolean not null default false,
  post_push boolean not null default false,
  -- Activities that started before Post Activity reminders were switched on are never reminded about
  post_since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notify_prefs enable row level security;
drop policy if exists "own notify prefs" on public.notify_prefs;
create policy "own notify prefs" on public.notify_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.notify_prefs to authenticated;
grant all on public.notify_prefs to service_role;

insert into public.notify_prefs (user_id, morning_email, morning_push, post_email, post_push, post_since)
  select user_id, true, true, true, true, now() - interval '12 hours' from public.profiles where is_admin
  on conflict (user_id) do nothing;
