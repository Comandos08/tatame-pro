
-- HARD FIX SUPERADMIN + SECURITY AUDIT
-- 3 policy changes, zero schema changes

-- 1. INSERT policy on tenants for SUPERADMIN
CREATE POLICY "Superadmin can insert tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());

-- 2. SELECT policy on tenants for SUPERADMIN (global visibility)
CREATE POLICY "Superadmin can view all tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (public.is_superadmin());

-- 3. Hardened INSERT policy on membership_analytics
-- Table uses tenant_slug (text), not tenant_id (UUID)
-- Resolve slug to tenant_id for function-based validation
DROP POLICY IF EXISTS "Authenticated users can insert analytics"
ON public.membership_analytics;

CREATE POLICY "Users can insert own tenant analytics"
ON public.membership_analytics
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_superadmin()
  OR EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.slug = membership_analytics.tenant_slug
      AND (
        public.is_tenant_admin(t.id)
        OR public.is_member_of_tenant(t.id)
      )
  )
);
