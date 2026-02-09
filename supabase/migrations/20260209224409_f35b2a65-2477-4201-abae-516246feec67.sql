
-- ============================================================================
-- PI A3: feature_access table + SQL functions + canonical seed
-- ============================================================================

-- 1. Create feature_access table
CREATE TABLE public.feature_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key text NOT NULL,
  scope text NOT NULL DEFAULT 'TENANT' CHECK (scope IN ('GLOBAL', 'TENANT')),
  allowed_roles text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feature_access_feature_key_unique UNIQUE (feature_key)
);

-- 2. Enable RLS
ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY;

-- 3. RLS: Anyone authenticated can read (needed for the hook)
CREATE POLICY "Authenticated users can read feature_access"
  ON public.feature_access
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. RLS: Only superadmin can modify
CREATE POLICY "Only superadmin can modify feature_access"
  ON public.feature_access
  FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- 5. Updated_at trigger
CREATE TRIGGER update_feature_access_updated_at
  BEFORE UPDATE ON public.feature_access
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. can_access_feature function (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.can_access_feature(p_tenant_id uuid, p_feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    -- Superadmin bypasses all
    public.is_superadmin()
    OR
    -- Check if user has any of the allowed roles for this feature
    EXISTS (
      SELECT 1
      FROM public.feature_access fa
      JOIN public.user_roles ur ON ur.role::text = ANY(fa.allowed_roles)
      WHERE fa.feature_key = p_feature_key
        AND fa.is_active = true
        AND ur.user_id = auth.uid()
        AND (
          -- For TENANT-scoped features, role must match tenant
          (fa.scope = 'TENANT' AND ur.tenant_id = p_tenant_id)
          OR
          -- For GLOBAL-scoped features, tenant_id on role is NULL
          (fa.scope = 'GLOBAL' AND ur.tenant_id IS NULL)
        )
    )
$$;

-- 7. list_allowed_features function (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.list_allowed_features(p_tenant_id uuid)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT fa.feature_key
  FROM public.feature_access fa
  WHERE fa.is_active = true
    AND (
      -- Superadmin gets all features
      public.is_superadmin()
      OR
      -- User has matching role
      EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = ANY(fa.allowed_roles)
          AND (
            (fa.scope = 'TENANT' AND ur.tenant_id = p_tenant_id)
            OR
            (fa.scope = 'GLOBAL' AND ur.tenant_id IS NULL)
          )
      )
    )
$$;

-- 8. Canonical seed (idempotent)
INSERT INTO public.feature_access (feature_key, scope, allowed_roles) VALUES
  -- Tenant App routes
  ('TENANT_APP', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_DASHBOARD', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_ATHLETES', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_MEMBERSHIPS', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_ACADEMIES', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_COACHES', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_GRADINGS', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_APPROVALS', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_RANKINGS', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_EVENTS', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_AUDIT_LOG', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_SECURITY', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_SETTINGS', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_BILLING', 'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_MY_AREA', 'TENANT', ARRAY['ADMIN_TENANT', 'ATLETA']),
  ('TENANT_HELP', 'TENANT', ARRAY['ADMIN_TENANT', 'ATLETA']),
  -- Portal routes
  ('ATHLETE_PORTAL', 'TENANT', ARRAY['ATLETA', 'ADMIN_TENANT']),
  ('ATHLETE_PORTAL_EVENTS', 'TENANT', ARRAY['ATLETA', 'ADMIN_TENANT']),
  ('ATHLETE_PORTAL_CARD', 'TENANT', ARRAY['ATLETA', 'ADMIN_TENANT']),
  -- Global admin
  ('GLOBAL_ADMIN', 'GLOBAL', ARRAY['SUPERADMIN_GLOBAL'])
ON CONFLICT (feature_key) DO NOTHING;
