
-- Temporarily grant service_role access to test the function
-- This will be revoked after validation
GRANT EXECUTE ON FUNCTION public.get_tenant_revenue_metrics_v1(uuid) TO service_role;
