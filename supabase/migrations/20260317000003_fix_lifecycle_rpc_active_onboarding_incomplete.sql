-- =============================================================================
-- FIX: change_tenant_lifecycle_state — handle ACTIVE tenants with
--      onboarding_completed = false
-- =============================================================================
-- Root cause: When a superadmin creates a tenant with status = 'ACTIVE' (skipping
-- the normal SETUP flow), the tenant is ACTIVE but onboarding_completed = false.
-- The original RPC idempotency check returned immediately for ACTIVE→ACTIVE
-- without updating onboarding_completed, and the complete-tenant-onboarding
-- Edge Function rejected these tenants with INVALID_STATUS (422).
--
-- This migration updates the RPC so that an ACTIVE→ACTIVE call still sets
-- onboarding_completed = true when it was previously false, allowing admins
-- of superadmin-created tenants to complete the onboarding wizard.
-- =============================================================================

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
  v_onboarding_completed boolean;
BEGIN
  -- Lock row deterministically
  SELECT lifecycle_status::text, onboarding_completed
    INTO v_current_state, v_onboarding_completed
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF v_current_state IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found.', p_tenant_id;
  END IF;

  -- Idempotency: same state = no-op for audit, BUT still fix onboarding_completed
  -- if the tenant is ACTIVE and somehow never had onboarding completed.
  IF v_current_state = p_new_state THEN
    IF v_current_state = 'ACTIVE' AND (v_onboarding_completed IS NOT TRUE) THEN
      UPDATE public.tenants
      SET onboarding_completed = true,
          onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
          onboarding_completed_by = COALESCE(onboarding_completed_by, auth.uid()),
          updated_at = now()
      WHERE id = p_tenant_id;
    END IF;
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
