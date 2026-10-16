-- =============================================================================
-- A minimal stand-in for the parts of Supabase that Wagbook's migrations rely
-- on, so the migrations can run inside PGlite (Postgres compiled to
-- WebAssembly) during tests. This file is NEVER applied to a real database.
--
-- Real Supabase provides: the anon / authenticated / service_role roles, the
-- auth schema (users, uid()), the storage schema (buckets, objects) and an
-- extensions schema. See docs/03-architecture.md, "Testing the database".
-- =============================================================================

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Supabase installs pgcrypto in the extensions schema; supabase/seed.sql uses it.
create extension if not exists pgcrypto with schema extensions;

-- The columns of Supabase Auth's users table that supabase/seed.sql writes.
create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  confirmation_token text,
  email_change text,
  email_change_token_new text,
  recovery_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id text not null,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  unique (provider_id, provider)
);

-- Supabase reads the signed-in user's id from the request's JWT claims.
-- Tests set the same setting by hand to act as a given user.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- The whole set of claims, as Supabase's auth.jwt() returns it. Tests set
-- request.jwt.claims to '{"aal":"aal2"}' to act as a session that has given
-- its two-step code.
create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb;
$$;

-- Supabase Auth's two-step sign-in factors (only the columns Wagbook reads).
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null default 'unverified',
  created_at timestamptz not null default now()
);

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  -- As on Supabase: one file per name in a bucket.
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
-- As on Supabase: both API roles reach storage.objects, and the policies decide.
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Supabase's defaults hand new objects in public to every API role. Recreate
-- that here so the tests prove our migrations really take it back.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

set search_path = public, extensions;
