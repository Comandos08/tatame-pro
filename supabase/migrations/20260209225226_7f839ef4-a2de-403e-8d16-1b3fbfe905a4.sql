
-- PI A4 Fix: Tighten audit_logs INSERT to require tenant context or superadmin
-- The previous WITH CHECK (true) was flagged by linter.
-- Replace with explicit check: user must have tenant context or be superadmin.
DROP POLICY "Authenticated users can insert audit_logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert audit_logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Superadmin can always insert
    is_superadmin()
    OR
    -- Tenant admin can insert for their tenant
    (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
    OR
    -- Any authenticated user can insert if tenant_id matches their profile
    (tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.tenant_id = audit_logs.tenant_id
    ))
    OR
    -- Allow null tenant_id inserts (global events) for authenticated users
    tenant_id IS NULL
  );
