-- Admins (Ben) can invite testers from the app's Settings page.
-- Make someone an admin by inviting them with is_admin = true:
--   insert into public.invites (email, note, is_admin) values ('you@example.com', 'owner', true);
alter table public.invites add column if not exists is_admin boolean not null default false;
alter table public.invites add column if not exists invited_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists is_admin boolean not null default false;
-- People can read their own is_admin flag (RLS "read own"), but cannot change it: the column-level
-- update grant on profiles only covers display_name, time_zone, consent_version and consent_at.

create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where email = lower(new.email);
  if not found then
    raise exception 'Aevigor is invite-only during the beta';
  end if;
  insert into public.profiles (user_id, email, display_name, is_admin)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), inv.is_admin)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- Keeps the flag in step if an admin row is added or changed after the person signed up
create or replace function public.on_invite_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set is_admin = new.is_admin where email = new.email and is_admin is distinct from new.is_admin;
  return new;
end $$;
drop trigger if exists aevigor_on_invite_changed on public.invites;
create trigger aevigor_on_invite_changed after insert or update of is_admin on public.invites
  for each row execute function public.on_invite_changed();

-- ---------- Explicit table access ----------
-- New Supabase projects may not grant table access by default, so say exactly what each role gets.
-- Row Level Security still limits every read to the person's own rows.
grant usage on schema public to authenticated, anon, service_role;
grant select on public.profiles, public.wellness, public.checkins, public.daily_status, public.daily_load, public.planned_tests to authenticated;
grant update (display_name, time_zone, consent_version, consent_at) on public.profiles to authenticated;
grant all on public.invites, public.profiles, public.intervals_secrets, public.wellness, public.checkins,
  public.daily_status, public.daily_load, public.planned_tests to service_role;
