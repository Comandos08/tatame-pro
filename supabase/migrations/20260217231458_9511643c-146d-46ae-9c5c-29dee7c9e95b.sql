
-- PI-ACADEMY-GOV-001A — Structural Hardening (SAFE GOLD)
-- Single migration: 4 steps in order

-- ============================================================
-- STEP 1: Backfill + NOT NULL Hardening for is_active
-- ============================================================
UPDATE public.academies SET is_active = true WHERE is_active IS NULL;
UPDATE public.academy_coaches SET is_active = true WHERE is_active IS NULL;

ALTER TABLE public.academies
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

ALTER TABLE public.academy_coaches
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

-- ============================================================
-- STEP 2: Drop Redundant Index
-- ============================================================
DROP INDEX IF EXISTS idx_academies_slug;

-- ============================================================
-- STEP 3: Drift Detection View v1
-- ============================================================
CREATE OR REPLACE VIEW public.academy_governance_audit_v1 AS

-- P0: Cross-tenant mismatch
SELECT
  ac.id AS record_id,
  ac.tenant_id,
  'academy_coaches' AS table_name,
  ac.academy_id,
  'P0' AS severity,
  'P0_CROSS_TENANT_COACH' AS issue_code,
  jsonb_build_object(
    'coach_tenant_id', ac.tenant_id,
    'academy_tenant_id', a.tenant_id
  ) AS details,
  now() AS detected_at
FROM public.academy_coaches ac
JOIN public.academies a ON a.id = ac.academy_id
WHERE ac.tenant_id <> a.tenant_id

UNION ALL

-- P0: Orphan academy reference
SELECT
  ac.id,
  ac.tenant_id,
  'academy_coaches',
  ac.academy_id,
  'P0',
  'P0_ORPHAN_ACADEMY_REF',
  jsonb_build_object('academy_id', ac.academy_id),
  now()
FROM public.academy_coaches ac
LEFT JOIN public.academies a ON a.id = ac.academy_id
WHERE a.id IS NULL

UNION ALL

-- P0: Orphan coach reference
SELECT
  ac.id,
  ac.tenant_id,
  'academy_coaches',
  ac.academy_id,
  'P0',
  'P0_ORPHAN_COACH_REF',
  jsonb_build_object('coach_id', ac.coach_id),
  now()
FROM public.academy_coaches ac
LEFT JOIN public.coaches c ON c.id = ac.coach_id
WHERE c.id IS NULL

UNION ALL

-- P1: Active coach in inactive academy
SELECT
  ac.id,
  ac.tenant_id,
  'academy_coaches',
  ac.academy_id,
  'P1',
  'P1_ACTIVE_COACH_INACTIVE_ACADEMY',
  jsonb_build_object(
    'academy_is_active', a.is_active,
    'coach_is_active', ac.is_active
  ),
  now()
FROM public.academy_coaches ac
JOIN public.academies a ON a.id = ac.academy_id
WHERE a.is_active = false AND ac.is_active = true

UNION ALL

-- P1: Slug not lowercase
SELECT
  a.id,
  a.tenant_id,
  'academies',
  a.id,
  'P1',
  'P1_SLUG_NOT_LOWERCASE',
  jsonb_build_object('slug', a.slug),
  now()
FROM public.academies a
WHERE a.slug <> lower(a.slug)

UNION ALL

-- P1: Basic invalid email format
SELECT
  a.id,
  a.tenant_id,
  'academies',
  a.id,
  'P1',
  'P1_INVALID_EMAIL_FORMAT',
  jsonb_build_object('email', a.email),
  now()
FROM public.academies a
WHERE a.email IS NOT NULL
  AND a.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';

-- ============================================================
-- STEP 4: Check Function (STABLE, NO SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_academy_governance_v1()
RETURNS TABLE (
  record_id uuid,
  tenant_id uuid,
  table_name text,
  academy_id uuid,
  severity text,
  issue_code text,
  details jsonb,
  detected_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT * FROM public.academy_governance_audit_v1;
$$;
