-- ================================================================
-- PI-INSTITUTIONAL-TENANT-LIFECYCLE-GOV-001
-- Step 1: Structural Enforcement (SAFE GOLD)
-- ================================================================

-- 1. Extend enum (IRREVERSIBLE)
ALTER TYPE public.tenant_lifecycle_status ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE public.tenant_lifecycle_status ADD VALUE IF NOT EXISTS 'TERMINATED';

-- 2. Gatekeeper function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.change_tenant_lifecycle_state(
  p_tenant_id uuid,
  p_new_state text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_state text;
BEGIN
  -- Lock row deterministically
  SELECT lifecycle_status::text INTO v_current_state
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF v_current_state IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found.', p_tenant_id;
  END IF;

  -- Idempotency: same state = no-op, no duplicate audit
  IF v_current_state = p_new_state THEN
    RETURN v_current_state;
  END IF;

  -- Transition matrix (deterministic, hardcoded)
  IF v_current_state = 'SETUP' AND p_new_state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid transition from SETUP to %', p_new_state;
  END IF;

  IF v_current_state = 'ACTIVE'
     AND p_new_state NOT IN ('SUSPENDED', 'TERMINATED') THEN
    RAISE EXCEPTION 'Invalid transition from ACTIVE to %', p_new_state;
  END IF;

  IF v_current_state = 'SUSPENDED'
     AND p_new_state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Invalid transition from SUSPENDED to %', p_new_state;
  END IF;

  IF v_current_state = 'TERMINATED' THEN
    RAISE EXCEPTION 'TERMINATED tenant is immutable.';
  END IF;

  IF v_current_state = 'BLOCKED' THEN
    RAISE EXCEPTION 'BLOCKED is a legacy state. Migrate to SUSPENDED first.';
  END IF;

  -- Cross-validation before ACTIVE
  IF p_new_state = 'ACTIVE' AND v_current_state <> 'ACTIVE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE tenant_id = p_tenant_id AND role = 'ADMIN_TENANT'
    ) THEN
      RAISE EXCEPTION 'Cannot activate tenant without ADMIN_TENANT role.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_billing
      WHERE tenant_id = p_tenant_id AND status IN ('ACTIVE', 'TRIALING')
    ) THEN
      RAISE EXCEPTION 'Cannot activate tenant without valid billing.';
    END IF;
  END IF;

  -- Apply update (BOTH columns + onboarding fields for SETUP->ACTIVE)
  IF v_current_state = 'SETUP' AND p_new_state = 'ACTIVE' THEN
    UPDATE public.tenants
    SET lifecycle_status = p_new_state::tenant_lifecycle_status,
        status = p_new_state,
        onboarding_completed = true,
        onboarding_completed_at = now(),
        onboarding_completed_by = auth.uid(),
        updated_at = now()
    WHERE id = p_tenant_id;
  ELSE
    UPDATE public.tenants
    SET lifecycle_status = p_new_state::tenant_lifecycle_status,
        status = p_new_state,
        updated_at = now()
    WHERE id = p_tenant_id;
  END IF;

  -- Mandatory audit log
  INSERT INTO public.audit_logs (
    event_type, tenant_id, profile_id, category, metadata
  ) VALUES (
    'TENANT_LIFECYCLE_STATE_CHANGED',
    p_tenant_id,
    auth.uid(),
    'GOVERNANCE',
    jsonb_build_object(
      'previous_state', v_current_state,
      'new_state', p_new_state,
      'reason', p_reason,
      'pi_reference', 'TENANT-GOV-001',
      'occurred_at', now()
    )
  );

  RETURN p_new_state;
END;
$$;

-- 3. Restrict execution to service_role only
REVOKE EXECUTE ON FUNCTION public.change_tenant_lifecycle_state(uuid, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_tenant_lifecycle_state(uuid, text, text)
  TO service_role;

-- 4. Drift detection view (read-only)
CREATE OR REPLACE VIEW public.tenant_lifecycle_governance_audit_v1 AS
SELECT
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.lifecycle_status::text AS lifecycle_status,
  t.status AS status_text,
  CASE
    WHEN t.lifecycle_status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM public.tenant_billing b
           WHERE b.tenant_id = t.id AND b.status IN ('ACTIVE', 'TRIALING')
         )
      THEN 'P0_ACTIVE_WITHOUT_BILLING'
    WHEN t.lifecycle_status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.tenant_id = t.id AND ur.role = 'ADMIN_TENANT'
         )
      THEN 'P0_ACTIVE_WITHOUT_ADMIN'
    WHEN t.lifecycle_status::text = 'BLOCKED'
      THEN 'P1_LEGACY_BLOCKED_STATE'
    WHEN t.lifecycle_status::text <> t.status
      THEN 'P1_STATUS_COLUMN_DIVERGENCE'
    ELSE NULL
  END AS issue_code,
  CASE
    WHEN t.lifecycle_status = 'ACTIVE'
         AND (
           NOT EXISTS (SELECT 1 FROM public.tenant_billing b WHERE b.tenant_id = t.id AND b.status IN ('ACTIVE', 'TRIALING'))
           OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = t.id AND ur.role = 'ADMIN_TENANT')
         )
      THEN 'P0'
    WHEN t.lifecycle_status::text = 'BLOCKED'
         OR t.lifecycle_status::text <> t.status
      THEN 'P1'
    ELSE NULL
  END AS severity,
  now() AS detected_at
FROM public.tenants t
WHERE
  (t.lifecycle_status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM public.tenant_billing b WHERE b.tenant_id = t.id AND b.status IN ('ACTIVE', 'TRIALING')
  ))
  OR (t.lifecycle_status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.tenant_id = t.id AND ur.role = 'ADMIN_TENANT'
  ))
  OR (t.lifecycle_status::text = 'BLOCKED')
  OR (t.lifecycle_status::text <> t.status);

-- 5. Convenience check function (STABLE)
CREATE OR REPLACE FUNCTION public.check_tenant_lifecycle_governance_v1()
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  lifecycle_status text,
  status_text text,
  issue_code text,
  severity text,
  detected_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$ SELECT * FROM public.tenant_lifecycle_governance_audit_v1; $$;