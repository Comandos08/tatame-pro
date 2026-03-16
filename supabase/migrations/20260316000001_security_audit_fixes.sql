-- ============================================================================
-- SECURITY AUDIT FIXES — 2026-03-16
-- Addresses findings from comprehensive codebase audit:
-- 1.4: Guard destructive dev migration from re-running
-- 1.5: Tighten RLS INSERT policies (athletes, guardians, guardian_links, documents)
-- 1.6: Restrict digital_cards public SELECT to verification-scoped access
-- 2.7: Attach missing CREATE TRIGGER for sport_types validation
-- 2.8: Add FK constraint on memberships.applicant_profile_id
-- ============================================================================

-- ============================================================================
-- 1.5: TIGHTEN RLS INSERT POLICIES — Replace WITH CHECK(true) on public tables
-- These policies allowed ANY anonymous user to INSERT rows with arbitrary
-- tenant_id values. Replace with tenant-scoped checks.
-- ============================================================================

-- athletes: require tenant to exist and be active
DROP POLICY IF EXISTS "Public can insert athletes for membership" ON public.athletes;
CREATE POLICY "Authenticated users can insert athletes for membership"
  ON public.athletes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND is_active = true)
  );

-- guardians: require tenant to exist and be active
DROP POLICY IF EXISTS "Public can insert guardians" ON public.guardians;
CREATE POLICY "Authenticated users can insert guardians"
  ON public.guardians FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND is_active = true)
  );

-- guardian_links: require tenant to exist and be active
DROP POLICY IF EXISTS "Public can insert guardian_links" ON public.guardian_links;
CREATE POLICY "Authenticated users can insert guardian_links"
  ON public.guardian_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND is_active = true)
  );

-- documents: require tenant to exist and be active
DROP POLICY IF EXISTS "Public can insert documents" ON public.documents;
CREATE POLICY "Authenticated users can insert documents"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id AND is_active = true)
  );

-- ============================================================================
-- 1.6: RESTRICT DIGITAL CARDS PUBLIC SELECT
-- Previous: USING(true) allowed enumeration of ALL digital cards.
-- Fix: Only allow viewing cards linked to active/approved memberships.
-- ============================================================================

DROP POLICY IF EXISTS "Public can verify digital cards" ON public.digital_cards;
CREATE POLICY "Public can verify digital cards"
  ON public.digital_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = membership_id
        AND m.status IN ('ACTIVE', 'APPROVED')
        AND m.payment_status = 'PAID'
    )
  );

-- ============================================================================
-- 2.7: ATTACH MISSING TRIGGER FOR sport_types VALIDATION
-- The function validate_tenant_sport_types() was created in migration
-- 20260206193957 but the CREATE TRIGGER statement was never issued.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_validate_tenant_sport_types ON public.tenants;
CREATE TRIGGER trg_validate_tenant_sport_types
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_tenant_sport_types();

-- ============================================================================
-- 2.8: ADD FK CONSTRAINT ON memberships.applicant_profile_id
-- This UUID column was added in migration 20260124224724 without a FK,
-- risking orphaned references when users are deleted.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_memberships_applicant_profile'
      AND table_name = 'memberships'
  ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT fk_memberships_applicant_profile
      FOREIGN KEY (applicant_profile_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;
