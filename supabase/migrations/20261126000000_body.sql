-- Profile sex: picks the male or female body figure and offers sex-specific features (each still opt-in).
alter table public.profiles add column if not exists sex text check (sex in ('female', 'male', 'unspecified'));
grant update (sex) on public.profiles to authenticated;

-- Lifting sets logged on Post Activity point at the intervals.icu activity they belong to (null = no watch activity).
alter table public.lift_sets add column if not exists activity_id text check (char_length(activity_id) <= 40);
