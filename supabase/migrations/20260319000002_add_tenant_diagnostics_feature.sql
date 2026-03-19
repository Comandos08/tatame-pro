-- Migration: Add TENANT_DIAGNOSTICS to feature_access
--
-- The /diagnostics route (TenantDiagnostics) uses RequireRoles(["ADMIN_TENANT"])
-- but had no RequireFeature gate, unlike all other admin-only routes.
-- Adding a consistent feature gate aligned with the architecture pattern.

INSERT INTO public.feature_access (feature_key, scope, allowed_roles)
VALUES ('TENANT_DIAGNOSTICS', 'TENANT', ARRAY['ADMIN_TENANT'])
ON CONFLICT (feature_key) DO NOTHING;
