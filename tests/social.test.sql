-- Friends, groups and the Zone 2 challenge: who can see and do what.
-- Users from the earlier test files: 22222222 (b), 33333333 (boss), 44444444 (h1), 55555555 (h2).
update public.profiles set consent_at = now(), display_name = 'Bea Rider' where user_id = '22222222-2222-2222-2222-222222222222';
update public.profiles set consent_at = now(), display_name = 'Boss Lady' where user_id = '33333333-3333-3333-3333-333333333333';
update public.profiles set consent_at = now(), display_name = 'Hal One' where user_id = '44444444-4444-4444-4444-444444444444';
update public.profiles set consent_at = now(), display_name = 'Hana Two' where user_id = '55555555-5555-5555-5555-555555555555';
do $$ begin
  if exists (select 1 from public.profiles where athlete_code is null or athlete_code !~ '^AEV-[A-Z2-9]{4}$') then raise exception 'athlete ID missing'; end if;
  if exists (select 1 from public.profiles where discoverable) then raise exception 'name search should be off by default'; end if;
end $$;
insert into public.activities (user_id, id, day, raw) values
  ('22222222-2222-2222-2222-222222222222', 'z1', '2026-11-23', '{"zt_power":"600,3600,300"}'),
  ('44444444-4444-4444-4444-444444444444', 'z2', '2026-11-24', '{"zt_hr":"100,1800,50"}'),
  ('55555555-5555-5555-5555-555555555555', 'z3', '2026-11-24', '{"zt_power":"0,7200"}');

set role authenticated;
set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
-- Name search is opt-in; an exact athlete ID always works
do $$ begin
  if (select count(*) from public.social_find_people('Hal')) <> 0 then raise exception 'found someone by name who did not opt in'; end if;
end $$;
select pg_temp.expect_fail($q$update public.profiles set athlete_code = 'AEV-FAKE'$q$);
select pg_temp.expect_fail($q$insert into public.friendships (user_a, user_b, requested_by) values ('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222')$q$);
reset role;
create temp table codes as select user_id, athlete_code from public.profiles;
grant select on codes to authenticated;
set role authenticated;
set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare c text := (select athlete_code from codes where user_id = '44444444-4444-4444-4444-444444444444'); begin
  if (select count(*) from public.social_find_people(c)) <> 1 then raise exception 'athlete ID search failed'; end if;
  if (select count(*) from public.social_find_people(lower(replace(c, 'AEV-', '')))) <> 1 then raise exception 'short athlete ID search failed'; end if;
end $$;
select public.social_friend('44444444-4444-4444-4444-444444444444', 'request');
select pg_temp.expect_fail($q$select public.social_friend('44444444-4444-4444-4444-444444444444', 'accept')$q$);   -- cannot accept your own request
set request.jwt.sub = '44444444-4444-4444-4444-444444444444';
update public.profiles set discoverable = true where user_id = '44444444-4444-4444-4444-444444444444';
select public.social_friend('22222222-2222-2222-2222-222222222222', 'accept');
set request.jwt.sub = '55555555-5555-5555-5555-555555555555';
do $$ begin
  if (select count(*) from public.social_find_people('Hal')) <> 1 then raise exception 'opted-in name search failed'; end if;
  if (select count(*) from public.friendships) <> 0 then raise exception 'sees other people''s friendships'; end if;
  if (select count(*) from public.social_names(array['22222222-2222-2222-2222-222222222222'::uuid])) <> 0 then raise exception 'names leak to strangers'; end if;
end $$;

-- Friends leaderboard: you and your friends only, Zone 2 power else heart rate
set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from public.challenge_z2('friends', '2026-11-23')) <> 2 then raise exception 'friends board wrong size'; end if;
  if (select z2_secs from public.challenge_z2('friends', '2026-11-23') where me) <> 3600 then raise exception 'power zone 2 not counted'; end if;
  if (select z2_secs from public.challenge_z2('friends', '2026-11-23') where not me) <> 1800 then raise exception 'HR zone 2 not counted'; end if;
end $$;

-- Groups: up to 3 each, leader approves, private is invite only
do $$ declare g uuid; begin
  g := public.social_group_create('Family Z2', 'private');
  perform public.social_group_create('Club', 'public');
  perform public.social_group_create('Team', 'public');
end $$;
select pg_temp.expect_fail($q$select public.social_group_create('Fourth', 'public')$q$);
select pg_temp.expect_fail($q$insert into public.social_groups (owner, name) values ('22222222-2222-2222-2222-222222222222', 'Sneaky')$q$);
select pg_temp.expect_fail($q$select public.social_group((select id from public.social_groups where name = 'Family Z2'), 'invite', '55555555-5555-5555-5555-555555555555')$q$);  -- not a friend
select public.social_group((select id from public.social_groups where name = 'Family Z2'), 'invite', '44444444-4444-4444-4444-444444444444');
set request.jwt.sub = '55555555-5555-5555-5555-555555555555';
do $$ begin
  if exists (select 1 from public.social_groups where name = 'Family Z2') then raise exception 'private group visible to outsiders'; end if;
  if (select count(*) from public.social_find_groups('Family')) <> 0 then raise exception 'private group listed'; end if;
  if (select count(*) from public.social_find_groups('Club')) <> 1 then raise exception 'public group not listed'; end if;
end $$;
select public.social_group((select id from public.social_groups where name = 'Club'), 'request');
do $$ begin
  if public.is_group_member((select id from public.social_groups where name = 'Club')) then raise exception 'joined without approval'; end if;
  if (select count(*) from public.challenge_z2((select id::text from public.social_groups where name = 'Club'), '2026-11-23')) <> 0 then raise exception 'board before approval'; end if;
exception when others then
  if sqlerrm not like '%Not a member%' then raise; end if;
end $$;
select pg_temp.expect_fail($q$select public.social_group((select id from public.social_groups where name = 'Club'), 'approve', '55555555-5555-5555-5555-555555555555')$q$);
select pg_temp.expect_fail($q$update public.group_members set status = 'member'$q$);
set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
select public.social_group((select id from public.social_groups where name = 'Club'), 'approve', '55555555-5555-5555-5555-555555555555');
set request.jwt.sub = '44444444-4444-4444-4444-444444444444';
select public.social_group((select id from public.social_groups where name = 'Family Z2'), 'accept_invite');
set request.jwt.sub = '55555555-5555-5555-5555-555555555555';
do $$ begin
  if (select count(*) from public.challenge_z2((select id::text from public.social_groups where name = 'Club'), '2026-11-23')) <> 2 then raise exception 'group board wrong'; end if;
  if exists (select 1 from public.social_groups where name = 'Family Z2') then raise exception 'sees a private group they are not in'; end if;
end $$;
select pg_temp.expect_fail($q$select public.challenge_z2((select id::text from public.social_groups where name = 'Team'), '2026-11-23')$q$);
select pg_temp.expect_fail($q$select public.social_group((select id from public.social_groups where name = 'Club'), 'remove', '22222222-2222-2222-2222-222222222222')$q$);
set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
select public.social_group((select id from public.social_groups where name = 'Club'), 'remove', '55555555-5555-5555-5555-555555555555');
reset role;
do $$ begin
  if exists (select 1 from public.group_members m join public.social_groups g on g.id = m.group_id where g.name = 'Club' and m.user_id = '55555555-5555-5555-5555-555555555555') then raise exception 'leader could not remove'; end if;
end $$;
delete from auth.users where id = '44444444-4444-4444-4444-444444444444';
do $$ begin
  if exists (select 1 from public.friendships where '44444444-4444-4444-4444-444444444444' in (user_a, user_b)) or exists (select 1 from public.group_members where user_id = '44444444-4444-4444-4444-444444444444')
  then raise exception 'deleting an account left social data behind'; end if;
end $$;
select 'social walls ok';
