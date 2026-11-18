-- Minimal stand-ins for what Supabase provides, so the migration can be tested on plain Postgres.
create role authenticated; create role anon; create role supabase_auth_admin; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
-- No default table privileges here on purpose: newer Supabase projects can be created without them,
-- so the migrations grant exactly what the app needs.
