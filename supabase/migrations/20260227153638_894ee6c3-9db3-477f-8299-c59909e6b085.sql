
-- Revoke temporary service_role access used for testing
REVOKE EXECUTE ON FUNCTION public.get_tenant_revenue_metrics_v1(uuid) FROM service_role;
