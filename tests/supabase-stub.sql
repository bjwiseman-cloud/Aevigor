-- Minimal stand-ins for what Supabase provides, so the migration can be tested on plain Postgres.
create role authenticated; create role anon; create role supabase_auth_admin; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
-- No default table privileges here on purpose: newer Supabase projects can be created without them,
-- so the migrations grant exactly what the app needs.
-- Storage stand-in for the private records bucket (migration 20261119000000_plan.sql)
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
