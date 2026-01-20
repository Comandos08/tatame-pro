-- 1. Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Grant permissions for cron to use net
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 3. Fix audit_logs RLS - Add INSERT policy for tenant admins
CREATE POLICY "Tenant admin can insert audit_logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
  OR is_superadmin()
);

-- 4. Also allow Staff to insert audit logs
CREATE POLICY "Staff can insert audit_logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL AND has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id)
);