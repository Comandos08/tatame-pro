-- PI-D5.B: RLS HARDENING FINAL
-- Deny-by-default for sensitive tables

-- ============================================================
-- A.1 AUDIT_LOGS — Restringir a SUPERADMIN + FED_ROLE apenas
-- ============================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Staff can view audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Staff can insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant admin can view audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant admin can insert audit_logs" ON public.audit_logs;

-- Create strict SELECT policy: SUPERADMIN OR FED_ROLE only
CREATE POLICY "audit_logs_select_superadmin_or_fed"
ON public.audit_logs
FOR SELECT
USING (
  is_superadmin()
  OR
  EXISTS (
    SELECT 1 FROM public.federation_roles fr
    WHERE fr.user_id = auth.uid()
    AND fr.role IN ('FED_ADMIN', 'COUNCIL_MEMBER', 'OBSERVER')
  )
);

-- Create INSERT policy: service_role + authenticated with valid tenant context
CREATE POLICY "audit_logs_insert_service_or_tenant_context"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR
  (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
  OR
  is_superadmin()
);

-- ============================================================
-- A.2 DOCUMENT_PUBLIC_TOKENS — Service role only for SELECT
-- ============================================================

-- Drop existing SELECT policy that allows tenant admins
DROP POLICY IF EXISTS "Tenant admins can view tokens" ON public.document_public_tokens;

-- Create strict SELECT policy: service_role only
CREATE POLICY "document_public_tokens_select_service_only"
ON public.document_public_tokens
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR is_superadmin()
);

-- ============================================================
-- A.3 SUPERADMIN_IMPERSONATIONS — Verify policies are correct
-- Already has correct policies (service_role + superadmin owns session)
-- No changes needed
-- ============================================================

-- Add explicit DELETE deny for audit_logs (immutability guarantee)
-- Already exists: audit_logs_no_delete

-- Add comment for documentation
COMMENT ON TABLE public.audit_logs IS 'PI-D5.B: DENY-BY-DEFAULT. SELECT only for SUPERADMIN_GLOBAL or federation roles.';
COMMENT ON TABLE public.document_public_tokens IS 'PI-D5.B: DENY-BY-DEFAULT. SELECT only via service_role or superadmin.';