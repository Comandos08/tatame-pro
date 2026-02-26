
-- ==========================================
-- 1. Store global IDs
-- ==========================================

CREATE TEMP TABLE tmp_global_admin AS
SELECT
  (SELECT id FROM auth.users WHERE email = 'global@tatame.pro') AS auth_user_id,
  (SELECT id FROM public.profiles WHERE email = 'global@tatame.pro') AS profile_id;

-- Guardrail
DO $$
BEGIN
  IF (SELECT auth_user_id FROM tmp_global_admin) IS NULL THEN
    RAISE EXCEPTION 'ABORT: global@tatame.pro not found in auth.users';
  END IF;
  IF (SELECT profile_id FROM tmp_global_admin) IS NULL THEN
    RAISE EXCEPTION 'ABORT: global@tatame.pro not found in public.profiles';
  END IF;
END $$;

-- ==========================================
-- 2. Remove ALL existing roles
-- ==========================================

DELETE FROM public.user_roles;

-- ==========================================
-- 3. Insert SUPERADMIN_GLOBAL role
-- ==========================================

INSERT INTO public.user_roles (
  user_id,
  role,
  tenant_id,
  created_at
)
SELECT
  auth_user_id,
  'SUPERADMIN_GLOBAL',
  NULL,
  NOW()
FROM tmp_global_admin;

-- ==========================================
-- 4. Ensure profile is detached from tenants
-- ==========================================

UPDATE public.profiles
SET tenant_id = NULL
WHERE id = (SELECT profile_id FROM tmp_global_admin);

-- ==========================================
-- 5. Clean any remaining auth users (safety)
-- ==========================================

DELETE FROM auth.users
WHERE email <> 'global@tatame.pro';

-- ==========================================
-- 6. Clean any remaining profiles
-- ==========================================

DELETE FROM public.profiles
WHERE email <> 'global@tatame.pro';

-- ==========================================
-- 7. Cleanup
-- ==========================================

DROP TABLE IF EXISTS tmp_global_admin;
