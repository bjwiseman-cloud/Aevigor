-- Phone alerts (Web Push) for reminders. Every 5 minutes the database asks the api function to send what is due.
-- No hand-made secrets: the function makes its own push keys on first use, and the 5-minute job uses a random
-- token created here. Both live in app_secrets, which only the server can read.
create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  device text check (char_length(device) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- What has already been sent, so each reminder goes out once
create table if not exists public.push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_sent enable row level security;

create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;   -- no policies: app users can never read it
insert into public.app_secrets (name, value) values ('push_cron_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (name) do nothing;

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions, public.push_sent, public.app_secrets to service_role;

-- "Delete my health data" also forgets this person's phones and sent-reminder log
create or replace function public.delete_my_push_data() returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where user_id = auth.uid();
  delete from public.push_sent where user_id = auth.uid();
$$;
revoke all on function public.delete_my_push_data() from public;
grant execute on function public.delete_my_push_data() to authenticated;

-- The 5-minute job (Supabase has pg_cron and pg_net; plain Postgres in the tests does not, so it is skipped there)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.unschedule(jobid) from cron.job where jobname = 'aevigor-push-due';
    perform cron.schedule('aevigor-push-due', '*/5 * * * *', $job$
      select net.http_post(
        url := 'https://oxhrmxydlnzvqidsjcbg.supabase.co/functions/v1/api/push-due',
        headers := jsonb_build_object('content-type', 'application/json',
          'x-push-token', (select value from public.app_secrets where name = 'push_cron_token')),
        body := '{}'::jsonb)
    $job$);
  end if;
end $$;
