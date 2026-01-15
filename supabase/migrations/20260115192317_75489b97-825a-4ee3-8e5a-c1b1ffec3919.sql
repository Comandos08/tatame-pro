-- Add default_locale to tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS default_locale TEXT DEFAULT 'pt-BR';

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Superadmin can view all logs
CREATE POLICY "Superadmin full access to audit_logs"
  ON public.audit_logs FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Tenant admin can view tenant logs
CREATE POLICY "Tenant admin can view audit_logs"
  ON public.audit_logs FOR SELECT
  USING (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id));

-- Staff can view tenant logs
CREATE POLICY "Staff can view audit_logs"
  ON public.audit_logs FOR SELECT
  USING (tenant_id IS NOT NULL AND has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id));