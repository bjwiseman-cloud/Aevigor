-- Beta sign-up requests from the aevigor.com beta page (Ben 2026-11-19). Written only by the api function
-- (service role); the admin approves or declines them on the Menu's Invite testers card.
create table if not exists public.beta_requests (
  email text primary key,
  name text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.beta_requests enable row level security;
-- No policies: nobody reads or writes it directly, only the api function with the service role.
revoke all on public.beta_requests from anon, authenticated;
grant all on public.beta_requests to service_role;
