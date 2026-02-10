
-- PI U15: institutional_feature_flags table
CREATE TABLE public.institutional_feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, flag)
);

-- Allow null tenant_id for global flags — unique constraint on (null, flag) needs partial index
CREATE UNIQUE INDEX idx_institutional_feature_flags_global_flag
  ON public.institutional_feature_flags (flag)
  WHERE tenant_id IS NULL;

-- Enable RLS
ALTER TABLE public.institutional_feature_flags ENABLE ROW LEVEL SECURITY;

-- SELECT: superadmin sees all, tenant_admin sees own tenant + globals
CREATE POLICY "Superadmin can read all feature flags"
  ON public.institutional_feature_flags
  FOR SELECT
  USING (is_superadmin());

CREATE POLICY "Tenant admin can read own and global flags"
  ON public.institutional_feature_flags
  FOR SELECT
  USING (
    NOT is_superadmin()
    AND (
      tenant_id IS NULL
      OR is_tenant_admin(tenant_id)
    )
  );

-- INSERT/UPDATE/DELETE: service_role only (no user policies)
-- No policies = denied for all authenticated users → service_role bypass only

-- Trigger for updated_at
CREATE TRIGGER update_institutional_feature_flags_updated_at
  BEFORE UPDATE ON public.institutional_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
