
-- =============================
-- 1. Store global IDs
-- =============================

CREATE TEMP TABLE tmp_global AS
SELECT
  (SELECT id FROM auth.users WHERE email = 'global@tatame.pro') AS auth_user_id,
  (SELECT id FROM public.profiles WHERE email = 'global@tatame.pro') AS profile_id;

-- Guardrail
DO $$
BEGIN
  IF (SELECT auth_user_id FROM tmp_global) IS NULL THEN
    RAISE EXCEPTION 'ABORT: global@tatame.pro not found in auth.users';
  END IF;
  IF (SELECT profile_id FROM tmp_global) IS NULL THEN
    RAISE EXCEPTION 'ABORT: global@tatame.pro not found in public.profiles';
  END IF;
END $$;

-- =============================
-- 2. Detach global profile from any tenant
-- =============================

UPDATE public.profiles
SET tenant_id = NULL
WHERE id = (SELECT profile_id FROM tmp_global);

-- =============================
-- 3. Disable RLS in all public tables
-- =============================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- =============================
-- 4. Delete ALL public data except global profile
-- =============================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('profiles')
  ) LOOP
    EXECUTE format('DELETE FROM public.%I;', r.tablename);
  END LOOP;
END $$;

DELETE FROM public.profiles
WHERE id <> (SELECT profile_id FROM tmp_global);

-- =============================
-- 5. Clean AUTH schema except global user
-- =============================

DO $$
DECLARE
  v_global UUID := (SELECT auth_user_id FROM tmp_global);
BEGIN
  -- mfa_challenges references mfa_factors, clean first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='mfa_challenges') THEN
    DELETE FROM auth.mfa_challenges
    WHERE factor_id IN (
      SELECT id FROM auth.mfa_factors WHERE user_id <> v_global
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='mfa_factors') THEN
    EXECUTE format('DELETE FROM auth.mfa_factors WHERE user_id <> %L;', v_global::text);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='sessions') THEN
    EXECUTE format('DELETE FROM auth.sessions WHERE user_id <> %L;', v_global::text);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='refresh_tokens') THEN
    EXECUTE format('DELETE FROM auth.refresh_tokens WHERE user_id <> %L;', v_global::text);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='identities') THEN
    EXECUTE format('DELETE FROM auth.identities WHERE user_id <> %L;', v_global::text);
  END IF;
END $$;

DELETE FROM auth.users
WHERE id <> (SELECT auth_user_id FROM tmp_global);

-- =============================
-- 6. Re-enable RLS
-- =============================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- =============================
-- 7. Cleanup
-- =============================

DROP TABLE IF EXISTS tmp_global;
