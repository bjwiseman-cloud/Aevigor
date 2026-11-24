-- Challenges, friends and groups (Ben 2026-11-24), plus calendar and reminder changes from the same edit list.
-- Privacy rules:
--   * Only training performance is ever shared (Zone 2 hours per week for the first challenge). Never health,
--     check-in, medication, log or record data.
--   * Name search is opt-in: nobody can be found by name until they switch on "Let people find me by name".
--     Anyone can be found by their exact athlete ID, which they choose to hand out.
--   * Groups: public (listed, people ask to join) or private (invite only). The leader (creator) approves requests,
--     invites and removes members. Each person can create up to 3 groups and join any number.
--   * Everything that touches another person's rows goes through the functions below (security definer, with
--     their own checks); the tables themselves only let people read what concerns them.

-- ---------- Athlete ID and name search opt-in ----------
alter table public.profiles add column if not exists athlete_code text;
alter table public.profiles add column if not exists discoverable boolean not null default false;
create unique index if not exists profiles_athlete_code on public.profiles (athlete_code);

create or replace function public.new_athlete_code() returns text language plpgsql volatile as $$
declare c text; abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    c := 'AEV-';
    for i in 1..4 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.profiles where athlete_code = c);
  end loop;
  return c;
end $$;
update public.profiles set athlete_code = public.new_athlete_code() where athlete_code is null;
create or replace function public.profiles_set_code() returns trigger language plpgsql as $$
begin
  if new.athlete_code is null then new.athlete_code := public.new_athlete_code(); end if;
  return new;
end $$;
drop trigger if exists profiles_set_code on public.profiles;
create trigger profiles_set_code before insert on public.profiles for each row execute function public.profiles_set_code();
grant update (discoverable) on public.profiles to authenticated;

-- ---------- Friends ----------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,   -- the smaller id of the pair
  user_b uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
alter table public.friendships enable row level security;
drop policy if exists "own friendships" on public.friendships;
create policy "own friendships" on public.friendships for select using (auth.uid() in (user_a, user_b));
grant select on public.friendships to authenticated;
revoke all on public.friendships from anon;

-- ---------- Groups ----------
create table if not exists public.social_groups (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.social_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  status text not null check (status in ('member', 'requested', 'invited')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create or replace function public.is_group_member(g uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid() and status = 'member')
$$;
create or replace function public.is_group_leader(g uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid() and status = 'member' and role = 'leader')
$$;
alter table public.social_groups enable row level security;
alter table public.group_members enable row level security;
drop policy if exists "see groups" on public.social_groups;
create policy "see groups" on public.social_groups for select using (
  visibility = 'public' or owner = auth.uid()
  or exists (select 1 from public.group_members m where m.group_id = social_groups.id and m.user_id = auth.uid()));
drop policy if exists "see members" on public.group_members;
create policy "see members" on public.group_members for select using (user_id = auth.uid() or public.is_group_member(group_id));
grant select on public.social_groups, public.group_members to authenticated;
revoke all on public.social_groups, public.group_members from anon;

-- Names of people you share something with (friends, requests, groups). Never email or any other field.
create or replace function public.social_names(ids uuid[]) returns table (user_id uuid, display_name text, athlete_code text)
language sql stable security definer set search_path = public as $$
  select p.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Athlete ' || p.athlete_code), p.athlete_code
  from public.profiles p
  where p.user_id = any(ids) and (
    p.user_id = auth.uid()
    or exists (select 1 from public.friendships f where auth.uid() in (f.user_a, f.user_b) and p.user_id in (f.user_a, f.user_b))
    or exists (select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
               -- members see everyone in the group (incl. requests and invites); people asking or invited see only the leader
               where a.user_id = auth.uid() and b.user_id = p.user_id and (a.status = 'member' or (b.status = 'member' and b.role = 'leader'))))
$$;

-- Find people: exact athlete ID for anyone, or part of the name for people who opted in.
create or replace function public.social_find_people(q text) returns table (user_id uuid, display_name text, athlete_code text, friend_status text)
language plpgsql stable security definer set search_path = public as $$
declare t text := btrim(coalesce(q, ''));
begin
  if char_length(t) < 2 then return; end if;
  return query
    select p.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Athlete ' || p.athlete_code), p.athlete_code,
      (select case when f.status = 'accepted' then 'friends' when f.requested_by = auth.uid() then 'sent' else 'received' end
       from public.friendships f where f.user_a = least(auth.uid(), p.user_id) and f.user_b = greatest(auth.uid(), p.user_id))
    from public.profiles p
    where p.user_id <> auth.uid() and p.consent_at is not null and (
      upper(p.athlete_code) = upper(replace(t, ' ', ''))
      or upper(p.athlete_code) = 'AEV-' || upper(replace(t, ' ', ''))
      or (p.discoverable and char_length(t) >= 3 and p.display_name ilike '%' || replace(replace(t, '%', ''), '_', '') || '%'))
    order by p.display_name limit 20;
end $$;

create or replace function public.social_friend(target uuid, action text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a uuid := least(me, target); b uuid := greatest(me, target); f public.friendships;
begin
  if me is null or target is null or target = me then raise exception 'Not allowed'; end if;
  select * into f from public.friendships where user_a = a and user_b = b;
  if action = 'request' then
    if not exists (select 1 from public.profiles where user_id = target) then raise exception 'No such athlete'; end if;
    if f.id is null then insert into public.friendships (user_a, user_b, requested_by) values (a, b, me);
    elsif f.status = 'pending' and f.requested_by <> me then update public.friendships set status = 'accepted' where id = f.id; end if;
  elsif action = 'accept' then
    if f.id is null or f.requested_by = me then raise exception 'No request to accept'; end if;
    update public.friendships set status = 'accepted' where id = f.id;
  elsif action = 'remove' then
    delete from public.friendships where id = f.id;
  else raise exception 'Unknown action';
  end if;
end $$;

create or replace function public.social_group_create(gname text, gvis text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.social_groups where owner = auth.uid()) >= 3 then raise exception 'You can create up to 3 groups'; end if;
  insert into public.social_groups (owner, name, visibility) values (auth.uid(), btrim(gname), gvis) returning id into g;
  insert into public.group_members (group_id, user_id, role, status) values (g, auth.uid(), 'leader', 'member');
  return g;
end $$;

-- One function for every group action, each with its own rule:
--   request (anyone, public groups) · cancel/leave (yourself) · accept_invite / decline (yourself, when invited)
--   approve / reject / invite / remove / rename / visibility / delete (the leader only)
create or replace function public.social_group(gid uuid, action text, target uuid default null, val text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.social_groups; lead boolean;
begin
  select * into g from public.social_groups where id = gid;
  if me is null or g.id is null then raise exception 'No such group'; end if;
  lead := exists (select 1 from public.group_members where group_id = gid and user_id = me and status = 'member' and role = 'leader');
  if action = 'request' then
    if g.visibility <> 'public' then raise exception 'This group is invite only'; end if;
    insert into public.group_members (group_id, user_id, role, status) values (gid, me, 'member', 'requested') on conflict do nothing;
  elsif action in ('cancel', 'leave', 'decline') then
    if g.owner = me then raise exception 'The leader cannot leave; delete the group instead'; end if;
    delete from public.group_members where group_id = gid and user_id = me;
  elsif action = 'accept_invite' then
    update public.group_members set status = 'member' where group_id = gid and user_id = me and status = 'invited';
  elsif not lead then raise exception 'Only the group leader can do that';
  elsif action = 'approve' then
    update public.group_members set status = 'member' where group_id = gid and user_id = target and status = 'requested';
  elsif action in ('reject', 'remove') then
    if target = g.owner then raise exception 'The leader cannot be removed'; end if;
    delete from public.group_members where group_id = gid and user_id = target;
  elsif action = 'invite' then
    -- only your friends, or someone who already asked to join
    if not exists (select 1 from public.friendships where user_a = least(me, target) and user_b = greatest(me, target) and status = 'accepted')
       and not exists (select 1 from public.group_members where group_id = gid and user_id = target and status = 'requested')
    then raise exception 'You can invite your friends'; end if;
    insert into public.group_members (group_id, user_id, role, status) values (gid, target, 'member', 'invited')
      on conflict (group_id, user_id) do update set status = case when public.group_members.status = 'requested' then 'member' else public.group_members.status end;
  elsif action = 'rename' then update public.social_groups set name = btrim(val) where id = gid;
  elsif action = 'visibility' then update public.social_groups set visibility = val where id = gid;
  elsif action = 'delete' then
    if g.owner <> me then raise exception 'Only the leader can delete the group'; end if;
    delete from public.social_groups where id = gid;
  else raise exception 'Unknown action';
  end if;
end $$;

-- Public groups by name, for "Find a group"
create or replace function public.social_find_groups(q text) returns table (id uuid, name text, members bigint, my_status text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'member'),
    (select m.status from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())
  from public.social_groups g
  where g.visibility = 'public' and char_length(btrim(coalesce(q, ''))) >= 2 and g.name ilike '%' || replace(replace(btrim(q), '%', ''), '_', '') || '%'
  order by g.name limit 20
$$;

-- ---------- Challenge: most Zone 2 hours in a week (Monday to Sunday) ----------
-- Zone 2 time per activity: power zone 2 when the activity has power zones, else heart-rate zone 2
-- (intervals.icu zone times, seconds per zone, comma separated). Only this one number leaves your account.
create or replace function public.z2_secs(raw jsonb) returns numeric language sql immutable as $$
  select coalesce(
    case when coalesce(raw ->> 'zt_power', '') ~ '^[0-9.]+,[0-9.]+' then split_part(raw ->> 'zt_power', ',', 2)::numeric end,
    case when coalesce(raw ->> 'zt_hr', '') ~ '^[0-9.]+,[0-9.]+' then split_part(raw ->> 'zt_hr', ',', 2)::numeric end,
    0)
$$;
-- scope 'friends' = you and your friends; otherwise a group id you are a member of
create or replace function public.challenge_z2(scope text, week_start date) returns table (user_id uuid, display_name text, z2_secs numeric, me boolean)
language plpgsql stable security definer set search_path = public as $$
declare ids uuid[];
begin
  if auth.uid() is null then return; end if;
  if scope = 'friends' then
    select array_agg(x) into ids from (
      select auth.uid() as x
      union select case when f.user_a = auth.uid() then f.user_b else f.user_a end from public.friendships f
        where f.status = 'accepted' and auth.uid() in (f.user_a, f.user_b)) s;
  else
    if not public.is_group_member(scope::uuid) then raise exception 'Not a member of this group'; end if;
    select array_agg(m.user_id) into ids from public.group_members m where m.group_id = scope::uuid and m.status = 'member';
  end if;
  return query
    select p.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Athlete ' || p.athlete_code),
      coalesce((select sum(public.z2_secs(a.raw)) from public.activities a where a.user_id = p.user_id and a.day between week_start and week_start + 6), 0),
      p.user_id = auth.uid()
    from public.profiles p where p.user_id = any(ids)
    order by 3 desc;
end $$;

do $$
declare f text;
begin
  foreach f in array array['social_names(uuid[])', 'social_find_people(text)', 'social_friend(uuid, text)', 'social_group_create(text, text)',
    'social_group(uuid, text, uuid, text)', 'social_find_groups(text)', 'challenge_z2(text, date)', 'is_group_member(uuid)', 'is_group_leader(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Calendar: Training entries, and Tests and Races without the health opt-in ----------
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('medical', 'lab', 'fitness_test', 'race', 'physio', 'other', 'training', 'social'));
-- Training, tests and races are not health data, so they can be saved without the health-data opt-in.
drop policy if exists "own rows write" on public.events;
create policy "own rows write" on public.events for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (kind in ('training', 'fitness_test', 'race', 'social') or public.has_health_consent()));

-- ---------- Reminders: pause all, and training vs appointment reminders separately ----------
alter table public.notify_prefs add column if not exists paused boolean not null default false;
alter table public.notify_prefs add column if not exists training_push boolean not null default true;   -- training, tests and races
alter table public.notify_prefs add column if not exists appt_push boolean not null default true;       -- appointments, events and My log
