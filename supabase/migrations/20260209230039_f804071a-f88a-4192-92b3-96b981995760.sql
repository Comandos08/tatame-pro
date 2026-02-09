
-- PI B2: Canonical tenant flags contract RPC
-- SECURITY INVOKER — respects caller RLS
-- Returns stable, fail-closed, null-free payload

-- Helper: normalize billing status to contract subset
CREATE OR REPLACE FUNCTION public.normalize_billing_status_contract(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE upper(coalesce(input, ''))
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'TRIALING' THEN 'TRIALING'
    WHEN 'TRIAL_EXPIRED' THEN 'PAST_DUE'
    WHEN 'PAST_DUE' THEN 'PAST_DUE'
    WHEN 'CANCELED' THEN 'BLOCKED'
    WHEN 'PENDING_DELETE' THEN 'BLOCKED'
    WHEN 'UNPAID' THEN 'BLOCKED'
    WHEN 'INCOMPLETE' THEN 'UNKNOWN'
    ELSE 'UNKNOWN'
  END;
$$;

-- Main contract RPC
CREATE OR REPLACE FUNCTION public.get_tenant_flags_contract(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant record;
  v_billing record;
  v_result jsonb;
BEGIN
  -- 1. Load tenant (RLS applies)
  SELECT id, onboarding_completed, status
  INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;

  -- Fail-closed: tenant not found or not accessible
  IF v_tenant.id IS NULL THEN
    RETURN jsonb_build_object(
      'tenant_id', p_tenant_id,
      'onboarding_completed', false,
      'billing', jsonb_build_object(
        'status', 'UNKNOWN',
        'is_manual_override', false,
        'has_billing_record', false
      ),
      'evaluated_at', now()::text,
      'contract_version', '1.0.0'
    );
  END IF;

  -- 2. Load billing (RLS applies)
  SELECT status::text, is_manual_override
  INTO v_billing
  FROM public.tenant_billing
  WHERE tenant_id = p_tenant_id;

  -- 3. Build contract
  v_result := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'onboarding_completed', coalesce(v_tenant.onboarding_completed, false),
    'billing', jsonb_build_object(
      'status', CASE
        WHEN v_billing.status IS NULL THEN 'UNKNOWN'
        ELSE public.normalize_billing_status_contract(v_billing.status)
      END,
      'is_manual_override', coalesce(v_billing.is_manual_override, false),
      'has_billing_record', (v_billing.status IS NOT NULL)
    ),
    'evaluated_at', now()::text,
    'contract_version', '1.0.0'
  );

  RETURN v_result;
END;
$$;
