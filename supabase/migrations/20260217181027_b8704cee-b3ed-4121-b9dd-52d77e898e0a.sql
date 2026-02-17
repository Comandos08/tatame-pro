
-- PI-INSTITUTIONAL-TENANT-LIFECYCLE-GOV-002
-- Enhanced Drift Detection v2 (SAFE GOLD — READ-ONLY)

-- 4.1 View
CREATE OR REPLACE VIEW public.tenant_lifecycle_governance_audit_v2 AS
WITH tenant_billing_agg AS (
  SELECT
    tb.tenant_id,
    tb.status AS billing_status
  FROM public.tenant_billing tb
),
tenant_admin_count AS (
  SELECT
    ur.tenant_id,
    count(*) AS admin_count
  FROM public.user_roles ur
  WHERE ur.role = 'ADMIN_TENANT'
  GROUP BY ur.tenant_id
),
base AS (
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.lifecycle_status::text AS lifecycle_status,
    t.status AS status_text,
    t.is_active,
    tba.billing_status::text AS billing_status,
    COALESCE(tac.admin_count, 0) AS admin_count
  FROM public.tenants t
  LEFT JOIN tenant_billing_agg tba ON tba.tenant_id = t.id
  LEFT JOIN tenant_admin_count tac ON tac.tenant_id = t.id
),
checks AS (
  SELECT
    b.*,
    CASE WHEN b.lifecycle_status = 'ACTIVE'
         AND (b.billing_status IS NULL OR b.billing_status NOT IN ('ACTIVE', 'TRIALING'))
      THEN true ELSE false END AS p0_no_billing,
    CASE WHEN b.lifecycle_status = 'ACTIVE'
         AND b.admin_count = 0
      THEN true ELSE false END AS p0_no_admin,
    CASE WHEN b.lifecycle_status = 'TERMINATED'
         AND b.billing_status IN ('ACTIVE', 'TRIALING')
      THEN true ELSE false END AS p0_terminated_billing,
    CASE WHEN b.lifecycle_status = 'SUSPENDED'
         AND b.billing_status IN ('ACTIVE', 'TRIALING')
         AND b.is_active = true
      THEN true ELSE false END AS p0_suspended_active,
    CASE WHEN b.lifecycle_status <> b.status_text
      THEN true ELSE false END AS p1_divergence,
    CASE WHEN b.is_active = false AND b.lifecycle_status = 'ACTIVE'
      THEN true ELSE false END AS p1_is_active_conflict,
    CASE WHEN b.lifecycle_status = 'BLOCKED'
      THEN true ELSE false END AS p1_legacy_blocked
  FROM base b
),
unpivoted AS (
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_ACTIVE_WITHOUT_BILLING' AS issue_code, 'P0' AS severity,
    jsonb_build_object(
      'billing_status', COALESCE(billing_status, 'NO_RECORD'),
      'admin_count', admin_count
    ) AS details
  FROM checks WHERE p0_no_billing
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_ACTIVE_WITHOUT_ADMIN', 'P0',
    jsonb_build_object(
      'billing_status', COALESCE(billing_status, 'NO_RECORD'),
      'admin_count', admin_count
    )
  FROM checks WHERE p0_no_admin
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_TERMINATED_WITH_ACTIVE_BILLING', 'P0',
    jsonb_build_object(
      'billing_status', billing_status,
      'admin_count', admin_count
    )
  FROM checks WHERE p0_terminated_billing
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P0_SUSPENDED_WITH_ACTIVE_BILLING', 'P0',
    jsonb_build_object(
      'billing_status', billing_status,
      'is_active', is_active,
      'admin_count', admin_count
    )
  FROM checks WHERE p0_suspended_active
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P1_STATUS_COLUMN_DIVERGENCE', 'P1',
    jsonb_build_object(
      'lifecycle_status', lifecycle_status,
      'status_text', status_text
    )
  FROM checks WHERE p1_divergence
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P1_IS_ACTIVE_LIFECYCLE_CONFLICT', 'P1',
    jsonb_build_object(
      'is_active', is_active,
      'lifecycle_status', lifecycle_status
    )
  FROM checks WHERE p1_is_active_conflict
  UNION ALL
  SELECT tenant_id, tenant_name, lifecycle_status, status_text, is_active,
    'P1_LEGACY_BLOCKED_STATE', 'P1',
    jsonb_build_object(
      'lifecycle_status', lifecycle_status
    )
  FROM checks WHERE p1_legacy_blocked
)
SELECT
  tenant_id,
  tenant_name,
  lifecycle_status,
  status_text,
  is_active,
  issue_code,
  severity,
  details,
  now() AS detected_at
FROM unpivoted;

-- 4.2 Function wrapper
CREATE OR REPLACE FUNCTION public.check_tenant_lifecycle_governance_v2()
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  lifecycle_status text,
  status_text text,
  is_active boolean,
  issue_code text,
  severity text,
  details jsonb,
  detected_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$ SELECT * FROM public.tenant_lifecycle_governance_audit_v2; $$;
