-- =============================================================================
-- Bootstrap stubs for offline Supabase type generation.
-- =============================================================================
-- Lovable Cloud manages the real Supabase deployment, so we have no dashboard
-- access and no live DB URL to introspect. To regenerate types.ts
-- deterministically from the migrations in this repo, we spin up a local
-- Postgres, create just enough of Supabase's auth/storage/cron/realtime
-- surface to let the 137 user migrations apply cleanly, then introspect the
-- public schema with @supabase/postgres-meta.
--
-- This file is ONLY used by scripts/supabase-types/gen.mjs. It must never be
-- deployed anywhere. The stubs here satisfy references only — none of the
-- auth/storage logic is functional.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS graphql;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS cron;

-- Supabase roles referenced by GRANTs in migrations.
DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT;   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_admin NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOLOGIN NOINHERIT;   EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Minimal auth.users with only the columns migrations reference (id, email).
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB,
  raw_app_meta_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One seed superadmin so migrations that bootstrap privileged users can assert
-- its existence and succeed.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'global@tatame.pro')
ON CONFLICT DO NOTHING;

-- auth.* functions — return null/'anon' in the stub; we never execute RLS here.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::JSONB;
$$;

-- Storage stubs (tables + helper functions migrations reference).
CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT,
  owner UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(regexp_replace(name, '/[^/]+$', ''), '/');
$$;

CREATE OR REPLACE FUNCTION storage.filename(name TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)];
$$;

CREATE OR REPLACE FUNCTION storage.extension(name TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT substring(storage.filename(name) FROM '\.([^\.]+)$');
$$;

-- pg_net (used by some Supabase edge hooks referenced in migrations).
CREATE OR REPLACE FUNCTION net.http_post(
  url TEXT, body JSONB DEFAULT '{}', params JSONB DEFAULT '{}',
  headers JSONB DEFAULT '{}', timeout_milliseconds INT DEFAULT 1000
) RETURNS BIGINT LANGUAGE sql AS $$ SELECT 0::BIGINT; $$;

-- pg_cron — the real extension needs shared_preload_libraries + its own config.
-- We can't load it in a throwaway Postgres, so we stub the schedule/unschedule
-- surface that migrations call. Stripping CREATE EXTENSION pg_cron happens in
-- gen.mjs; everything else works against this stub.
CREATE TABLE IF NOT EXISTS cron.job (
  jobid BIGSERIAL PRIMARY KEY,
  schedule TEXT,
  command TEXT,
  nodename TEXT DEFAULT 'localhost',
  nodeport INT DEFAULT 5432,
  database TEXT DEFAULT current_database(),
  username TEXT DEFAULT CURRENT_USER,
  active BOOLEAN DEFAULT true,
  jobname TEXT
);

CREATE OR REPLACE FUNCTION cron.schedule(job_name TEXT, schedule TEXT, command TEXT)
RETURNS BIGINT LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (job_name, schedule, command)
  RETURNING jobid;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_name TEXT) RETURNS BOOLEAN LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobname = job_name;
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_id BIGINT) RETURNS BOOLEAN LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobid = job_id;
  SELECT true;
$$;

-- Realtime publication referenced by migrations that call
-- ALTER PUBLICATION supabase_realtime ADD TABLE ...
CREATE PUBLICATION supabase_realtime;

-- Seed a placeholder profile for the global superadmin so migrations that
-- backfill privileged rows can reference it.
-- (Profiles table itself is created by an early user migration; this runs
-- post-migration via gen.mjs, not here.)
