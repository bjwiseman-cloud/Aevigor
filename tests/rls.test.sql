-- Privacy-wall checks: each statement that should be refused is wrapped so the test fails if it is allowed.
create or replace function pg_temp.expect_fail(sql text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'expected this to be refused: %', sql;
end $$;

insert into public.invites (email, note) values ('a@x.com', null), ('b@x.com', null);
insert into public.invites (email, note, is_admin) values ('boss@x.com', 'owner', true);
do $$ begin
  if public.hook_before_user_created('{"user":{"email":"A@x.com"}}') <> '{}'::jsonb then raise exception 'invited email refused'; end if;
  if public.hook_before_user_created('{"user":{"email":"stranger@x.com"}}') -> 'error' ->> 'http_code' <> '403' then raise exception 'stranger allowed'; end if;
end $$;
select pg_temp.expect_fail($q$insert into auth.users (email) values ('stranger@x.com')$q$);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'A@x.com'), ('22222222-2222-2222-2222-222222222222', 'b@x.com'), ('33333333-3333-3333-3333-333333333333', 'boss@x.com');
do $$ begin
  if not (select is_admin from public.profiles where email = 'boss@x.com') then raise exception 'admin flag not copied from the invite'; end if;
  if (select is_admin from public.profiles where email = 'a@x.com') then raise exception 'tester became admin'; end if;
end $$;
insert into public.daily_status (user_id, day, status, weekly) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'GO', 'OK'), ('22222222-2222-2222-2222-222222222222', '2026-11-16', 'CAUTION', 'OK');
insert into public.intervals_secrets values ('11111111-1111-1111-1111-111111111111', 'v1:x:y');
insert into public.daily_load (user_id, day, sport, actual) values ('11111111-1111-1111-1111-111111111111', '2026-11-15', 'ride', 80), ('22222222-2222-2222-2222-222222222222', '2026-11-15', 'ride', 60);
insert into public.planned_tests (user_id, day, kind) values ('22222222-2222-2222-2222-222222222222', '2026-11-25', 'FTP test');

set role authenticated;
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select count(*) from public.daily_status) <> 1 then raise exception 'sees other people''s status rows'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'sees other profiles'; end if;
  if (select count(*) from public.daily_load) <> 1 then raise exception 'sees other people''s load'; end if;
  if (select count(*) from public.planned_tests) <> 0 then raise exception 'sees other people''s tests'; end if;
end $$;
select pg_temp.expect_fail('select * from public.intervals_secrets');
select pg_temp.expect_fail('select * from public.invites');
select pg_temp.expect_fail($q$update public.profiles set intervals_athlete_id = 'x'$q$);
select pg_temp.expect_fail($q$update public.profiles set is_admin = true$q$);
select pg_temp.expect_fail($q$insert into public.invites (email) values ('sneaky@x.com')$q$);
select pg_temp.expect_fail($q$insert into public.daily_load (user_id, day, sport) values ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'ride')$q$);
select pg_temp.expect_fail($q$insert into public.daily_status (user_id, day, status, weekly) values ('11111111-1111-1111-1111-111111111111', '2026-11-17', 'GO', 'OK')$q$);
update public.profiles set consent_at = now(), consent_version = 'beta-1';
update public.profiles set time_zone = 'X' where user_id = '22222222-2222-2222-2222-222222222222';  -- silently matches nothing
reset role;
do $$ begin
  if (select time_zone from public.profiles where email = 'b@x.com') <> 'America/Edmonton' then raise exception 'changed someone else''s profile'; end if;
  if (select consent_version from public.profiles where email = 'a@x.com') is distinct from 'beta-1' then raise exception 'could not save own consent'; end if;
end $$;
delete from auth.users where email = 'A@x.com';
do $$ begin
  if (select count(*) from public.daily_status where user_id = '11111111-1111-1111-1111-111111111111') + (select count(*) from public.intervals_secrets) + (select count(*) from public.profiles where email = 'a@x.com') + (select count(*) from public.daily_load where user_id = '11111111-1111-1111-1111-111111111111') <> 0
  then raise exception 'deleting an account left data behind'; end if;
end $$;
select 'privacy walls ok';
