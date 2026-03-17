-- ============================================================================
-- TENANT BOUNDARY ENFORCEMENT — 2026-03-17
-- Adds BEFORE INSERT/UPDATE triggers to athlete child-tables to ensure
-- tenant_id always matches the parent athlete's tenant_id.
-- This closes the master-detail cross-tenant integrity gap identified in the
-- security audit (MEDIUM priority): athlete.tenant_id ≠ membership.tenant_id
-- was structurally possible via service_role calls bypassing RLS.
--
-- Pattern mirrors existing event_* tenant validation triggers from migration
-- 20260124123509_3978ec61.
-- Tables covered: memberships, documents, athlete_gradings, diplomas
-- ============================================================================

-- ============================================================================
-- 1. memberships — athlete must belong to same tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_membership_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.athlete_id IS NOT NULL THEN
    IF NEW.tenant_id != (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id) THEN
      RAISE EXCEPTION 'memberships.tenant_id must match athlete.tenant_id (membership tenant: %, athlete tenant: %)',
        NEW.tenant_id,
        (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memberships_tenant_check ON public.memberships;
CREATE TRIGGER trg_memberships_tenant_check
  BEFORE INSERT OR UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.validate_membership_tenant();

-- ============================================================================
-- 2. documents — athlete must belong to same tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_document_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.athlete_id IS NOT NULL THEN
    IF NEW.tenant_id != (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id) THEN
      RAISE EXCEPTION 'documents.tenant_id must match athlete.tenant_id (document tenant: %, athlete tenant: %)',
        NEW.tenant_id,
        (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_tenant_check ON public.documents;
CREATE TRIGGER trg_documents_tenant_check
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_tenant();

-- ============================================================================
-- 3. athlete_gradings — athlete must belong to same tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_grading_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.athlete_id IS NOT NULL THEN
    IF NEW.tenant_id != (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id) THEN
      RAISE EXCEPTION 'athlete_gradings.tenant_id must match athlete.tenant_id (grading tenant: %, athlete tenant: %)',
        NEW.tenant_id,
        (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_athlete_gradings_tenant_check ON public.athlete_gradings;
CREATE TRIGGER trg_athlete_gradings_tenant_check
  BEFORE INSERT OR UPDATE ON public.athlete_gradings
  FOR EACH ROW EXECUTE FUNCTION public.validate_grading_tenant();

-- ============================================================================
-- 4. diplomas — athlete must belong to same tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_diploma_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.athlete_id IS NOT NULL THEN
    IF NEW.tenant_id != (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id) THEN
      RAISE EXCEPTION 'diplomas.tenant_id must match athlete.tenant_id (diploma tenant: %, athlete tenant: %)',
        NEW.tenant_id,
        (SELECT tenant_id FROM public.athletes WHERE id = NEW.athlete_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_diplomas_tenant_check ON public.diplomas;
CREATE TRIGGER trg_diplomas_tenant_check
  BEFORE INSERT OR UPDATE ON public.diplomas
  FOR EACH ROW EXECUTE FUNCTION public.validate_diploma_tenant();
