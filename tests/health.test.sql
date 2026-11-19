-- Health log walls: separate opt-in, own rows only, and Delete my health data. Runs after rls.test.sql setup.
create or replace function pg_temp.expect_fail(sql text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'expected this to be refused: %', sql;
end $$;
insert into public.invites (email) values ('h1@x.com'), ('h2@x.com');
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'h1@x.com'), ('55555555-5555-5555-5555-555555555555', 'h2@x.com');

set role authenticated;
set request.jwt.sub = '44444444-4444-4444-4444-444444444444';
-- No opt-in yet: every health write is refused
select pg_temp.expect_fail($q$insert into public.log_items (category, name, rrule, start_date) values ('supplement', 'Creatine', 'FREQ=DAILY', '2026-11-18')$q$);
select pg_temp.expect_fail($q$insert into public.bp_readings (taken_at, systolic, diastolic) values (now(), 120, 80)$q$);
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values ('records', '44444444-4444-4444-4444-444444444444/a.pdf')$q$);
update public.profiles set health_consent_at = now();
insert into public.log_items (category, name, rrule, start_date) values ('supplement', 'Creatine', 'FREQ=DAILY', '2026-11-18');
insert into public.bp_readings (taken_at, systolic, diastolic) values (now(), 120, 80);
insert into public.records (kind, day) values ('blood', '2026-11-01');
insert into public.lab_values (record_id, marker, value_num, flag) select id, 'Ferritin', 80, 'Normal' from public.records;
insert into storage.objects (bucket_id, name) values ('records', '44444444-4444-4444-4444-444444444444/a.pdf');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values ('records', '55555555-5555-5555-5555-555555555555/b.pdf')$q$);
select pg_temp.expect_fail($q$insert into public.bp_readings (user_id, taken_at, systolic, diastolic) values ('55555555-5555-5555-5555-555555555555', now(), 1, 1)$q$);
insert into public.ui_layout (page, card_order) values ('records', '{bp,labs}');
insert into public.cycle_settings (life_stage) values ('regular');
insert into public.cycle_days (day, period, flow, symptoms) values ('2026-11-10', true, 'medium', '{cramps}');
insert into public.records (kind, day) values ('mammogram', '2026-10-01');
select pg_temp.expect_fail($q$insert into public.cycle_days (user_id, day) values ('55555555-5555-5555-5555-555555555555', '2026-11-10')$q$);

set request.jwt.sub = '55555555-5555-5555-5555-555555555555';
update public.profiles set health_consent_at = now();
do $$ begin
  if (select count(*) from public.log_items) + (select count(*) from public.bp_readings) + (select count(*) from public.records)
     + (select count(*) from public.lab_values) + (select count(*) from storage.objects) + (select count(*) from public.ui_layout)
     + (select count(*) from public.cycle_days) + (select count(*) from public.cycle_settings) <> 0
  then raise exception 'sees someone else''s health data'; end if;
end $$;

set request.jwt.sub = '44444444-4444-4444-4444-444444444444';
select public.delete_my_health_data();
reset role;
do $$ begin
  if (select count(*) from public.log_items) + (select count(*) from public.bp_readings) + (select count(*) from public.records) + (select count(*) from public.lab_values) + (select count(*) from public.cycle_days) + (select count(*) from public.cycle_settings) <> 0
  then raise exception 'Delete my health data left rows behind'; end if;
  if (select health_consent_at from public.profiles where email = 'h1@x.com') is not null then raise exception 'opt-in not cleared'; end if;
  if (select health_consent_at from public.profiles where email = 'h2@x.com') is null then raise exception 'cleared someone else''s opt-in'; end if;
end $$;
-- Performance rows: server-written, read own only
insert into public.activities (user_id, id, day, type) values ('44444444-4444-4444-4444-444444444444', 'i1', '2026-11-10', 'Ride'), ('55555555-5555-5555-5555-555555555555', 'i2', '2026-11-10', 'Ride');
insert into public.power_curves (user_id, sport, curve, secs, watts) values ('55555555-5555-5555-5555-555555555555', 'ride', 'all', '{5}', '{900}');
set role authenticated;
set request.jwt.sub = '44444444-4444-4444-4444-444444444444';
do $$ begin
  if (select count(*) from public.activities) <> 1 or (select count(*) from public.power_curves) <> 0 then raise exception 'sees someone else''s activities or curves'; end if;
end $$;
select pg_temp.expect_fail($q$insert into public.activities (user_id, id, day) values ('44444444-4444-4444-4444-444444444444', 'x', '2026-11-11')$q$);
select pg_temp.expect_fail($q$update public.activities set name = 'x'$q$);
select pg_temp.expect_fail($q$select * from public.app_secrets$q$);
select pg_temp.expect_fail($q$select * from public.push_sent$q$);
insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/1', 'k', 'a');
select pg_temp.expect_fail($q$insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.example/2', '55555555-5555-5555-5555-555555555555', 'k', 'a')$q$);
set request.jwt.sub = '55555555-5555-5555-5555-555555555555';
do $$ begin if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'sees someone else''s phone'; end if; end $$;
set request.jwt.sub = '44444444-4444-4444-4444-444444444444';
select public.delete_my_push_data();
do $$ begin if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'push data not deleted'; end if; end $$;
reset role;
do $$ begin if (select length(value) from public.app_secrets where name = 'push_cron_token') < 40 then raise exception 'no cron token'; end if; end $$;
select 'health walls ok';
