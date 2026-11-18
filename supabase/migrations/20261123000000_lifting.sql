-- Lifting log: one row per set, entered in the app or imported from a CSV export (FitNotes, Strong, Liftosaur, Hevy…).
-- Weights are stored in kg. Private to each person (Row Level Security); deleted with the account.
create table if not exists public.lift_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  exercise text not null check (char_length(exercise) between 1 and 80),
  set_no int not null default 1 check (set_no between 1 and 100),
  reps int not null check (reps between 0 and 1000),
  weight numeric not null default 0 check (weight >= 0 and weight < 2000),   -- kg
  rir numeric check (rir between 0 and 10),                                  -- reps in reserve
  warmup boolean not null default false,
  note text check (char_length(note) <= 200),
  source text not null default 'app' check (char_length(source) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists lift_sets_user_day on public.lift_sets (user_id, day desc);
create index if not exists lift_sets_user_exercise on public.lift_sets (user_id, exercise);

alter table public.lift_sets enable row level security;
drop policy if exists "own lift sets" on public.lift_sets;
create policy "own lift sets" on public.lift_sets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.lift_sets to authenticated;
grant all on public.lift_sets to service_role;
