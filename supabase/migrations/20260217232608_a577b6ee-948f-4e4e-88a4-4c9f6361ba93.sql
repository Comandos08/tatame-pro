
-- PI-INSTITUTIONAL-INTEGRITY-DASHBOARD-001
-- Consolidated Institutional Integrity Layer (READ-ONLY)
-- Creates: VIEW + STABLE FUNCTION. Zero mutations.

CREATE OR REPLACE VIEW public.institutional_integrity_audit_v1 AS
SELECT
  'TENANT'::text AS domain,
  tenant_id,
  tenant_id AS record_id,
  'tenant'::text AS entity_type,
  severity,
  issue_code,
  details,
  detected_at
FROM public.tenant_lifecycle_governance_audit_v2

UNION ALL

SELECT
  'MEMBERSHIP'::text,
  tenant_id,
  membership_id,
  'membership'::text,
  severity,
  issue_code,
  details,
  detected_at
FROM public.membership_governance_audit_v1

UNION ALL

SELECT
  'ACADEMY'::text,
  tenant_id,
  record_id,
  table_name,
  severity,
  issue_code,
  details,
  detected_at
FROM public.academy_governance_audit_v1;

-- STABLE check function (no SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_institutional_integrity_v1()
RETURNS TABLE (
  domain text,
  tenant_id uuid,
  record_id uuid,
  entity_type text,
  severity text,
  issue_code text,
  details jsonb,
  detected_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT * FROM public.institutional_integrity_audit_v1;
$$;
