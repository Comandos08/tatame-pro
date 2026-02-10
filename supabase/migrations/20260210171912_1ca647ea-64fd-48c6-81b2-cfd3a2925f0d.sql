
-- ============================================================
-- PI U7 — FASE 1 (P0): CORREÇÕES CRÍTICAS DE RLS
-- ============================================================

-- -------------------------------------------------------
-- P0.1: FIX guardian self-join bug on memberships
-- BUG: gl.athlete_id = gl.athlete_id (always TRUE)
-- FIX: gl.athlete_id = memberships.athlete_id
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Guardians can view linked athlete memberships" ON public.memberships;

CREATE POLICY "Guardians can view linked athlete memberships"
ON public.memberships
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM guardian_links gl
    JOIN guardians g ON g.id = gl.guardian_id
    WHERE gl.athlete_id = memberships.athlete_id
      AND g.profile_id = auth.uid()
  )
);

-- -------------------------------------------------------
-- P0.2: ADD WITH CHECK to memberships UPDATE
-- BEFORE: WITH CHECK was NULL (allows tenant_id change)
-- AFTER: WITH CHECK = USING (prevents cross-tenant mutation)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Tenant admins can update memberships" ON public.memberships;

CREATE POLICY "Tenant admins can update memberships"
ON public.memberships
FOR UPDATE
USING (is_superadmin() OR is_tenant_admin(tenant_id))
WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- -------------------------------------------------------
-- P0.3: REMOVE diploma public enumeration policy
-- BEFORE: USING(status = 'ISSUED') — allows SELECT * enumeration
-- AFTER: Removed. Public verification MUST go through Edge Function.
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Public can verify issued diplomas" ON public.diplomas;

-- -------------------------------------------------------
-- P0.4: REMOVE membership card verification public policy
-- BEFORE: USING(membership_has_digital_card(id)) — enumeration
-- AFTER: Removed. Card verification already uses Edge Function.
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Public can view membership via card verification" ON public.memberships;

-- -------------------------------------------------------
-- P1.5: ADD WITH CHECK to tenants UPDATE
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Tenant admin can update own tenant" ON public.tenants;

CREATE POLICY "Tenant admin can update own tenant"
ON public.tenants
FOR UPDATE
USING (is_superadmin() OR is_tenant_admin(id))
WITH CHECK (is_superadmin() OR is_tenant_admin(id));

-- -------------------------------------------------------
-- P1.6: ADD WITH CHECK to user_roles UPDATE
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (
  is_superadmin()
  OR (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id) AND role <> 'SUPERADMIN_GLOBAL'::app_role)
)
WITH CHECK (
  is_superadmin()
  OR (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id) AND role <> 'SUPERADMIN_GLOBAL'::app_role)
);
