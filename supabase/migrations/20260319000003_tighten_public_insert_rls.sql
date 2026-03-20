-- Migration: Tighten public INSERT policies on athletes and memberships
--
-- Root cause: Both tables had WITH CHECK (true) for public INSERT, allowing
-- any unauthenticated client to insert records pointing to arbitrary or
-- non-existent tenant_ids (UUID enumeration / spam vector).
--
-- Fix: Require the target tenant_id to exist and not be TERMINATED.
-- Onboarding flow is unaffected — users still register freely, they just
-- can't provide a fabricated tenant UUID that doesn't exist in the system.
--
-- Note: audit_logs INSERT was already tightened in migration
-- 20260209225226 (PI A4 Fix) and is not touched here.

-- ── athletes ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public can insert athletes for membership" ON public.athletes;

CREATE POLICY "Public can insert athletes for membership"
  ON public.athletes
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT id FROM public.tenants
      WHERE lifecycle_status <> 'TERMINATED'
    )
  );

-- ── memberships ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public can insert memberships" ON public.memberships;

CREATE POLICY "Public can insert memberships"
  ON public.memberships
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT id FROM public.tenants
      WHERE lifecycle_status <> 'TERMINATED'
    )
  );
