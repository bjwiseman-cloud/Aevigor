-- Privacy-wall checks: each statement that should be refused is wrapped so the test fails if it is allowed.
create or replace function pg_temp.expect_fail(sql text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'expected this to be refused: %', sql;
end $$;

insert into public.invites values ('a@x.com', null), ('b@x.com', null);
do $$ begin
  if public.hook_before_user_created('{"user":{"email":"A@x.com"}}') <> '{}'::jsonb then raise exception 'invited email refused'; end if;
  if public.hook_before_user_created('{"user":{"email":"stranger@x.com"}}') -> 'error' ->> 'http_code' <> '403' then raise exception 'stranger allowed'; end if;
end $$;
select pg_temp.expect_fail($q$insert into auth.users (email) values ('stranger@x.com')$q$);
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'A@x.com'), ('22222222-2222-2222-2222-222222222222', 'b@x.com');
insert into public.daily_status (user_id, day, status, weekly) values
  ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'GO', 'OK'), ('22222222-2222-2222-2222-222222222222', '2026-11-16', 'CAUTION', 'OK');
insert into public.intervals_secrets values ('11111111-1111-1111-1111-111111111111', 'v1:x:y');

set role authenticated;
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select count(*) from public.daily_status) <> 1 then raise exception 'sees other people''s status rows'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'sees other profiles'; end if;
  if (select count(*) from public.invites) <> 0 then raise exception 'can read the invite list'; end if;
end $$;
select pg_temp.expect_fail('select * from public.intervals_secrets');
select pg_temp.expect_fail($q$update public.profiles set intervals_athlete_id = 'x'$q$);
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
  if (select count(*) from public.daily_status where user_id = '11111111-1111-1111-1111-111111111111') + (select count(*) from public.intervals_secrets) + (select count(*) from public.profiles where email = 'a@x.com') <> 0
  then raise exception 'deleting an account left data behind'; end if;
end $$;
select 'privacy walls ok';
