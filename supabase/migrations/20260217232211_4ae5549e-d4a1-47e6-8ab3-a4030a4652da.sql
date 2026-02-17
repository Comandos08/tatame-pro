
-- PI-TENANT-ACADEMY-CASCADE-001
-- Tenant ↔ Academy Lifecycle Invariant (SAFE GOLD)
-- Modifies ONLY: change_academy_state, change_tenant_lifecycle_state

-- STEP 1: Add tenant lifecycle check to change_academy_state
CREATE OR REPLACE FUNCTION public.change_academy_state(
  p_academy_id uuid,
  p_new_is_active boolean,
  p_reason text,
  p_actor_profile_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_academy record;
  v_previous_state boolean;
  v_tenant_status text;
BEGIN
  -- Lock row
  SELECT * INTO v_academy FROM public.academies WHERE id = p_academy_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academy % not found.', p_academy_id;
  END IF;

  v_previous_state := v_academy.is_active;

  -- INVARIANT: Cannot activate academy if tenant is not ACTIVE
  IF p_new_is_active = true THEN
    SELECT lifecycle_status::text INTO v_tenant_status
    FROM public.tenants
    WHERE id = v_academy.tenant_id;

    IF v_tenant_status != 'ACTIVE' THEN
      RAISE EXCEPTION
        USING MESSAGE = 'ACADEMY_CANNOT_BE_ACTIVATED_WHEN_TENANT_NOT_ACTIVE',
              DETAIL = format(
                'Tenant %s lifecycle_status = %s',
                v_academy.tenant_id,
                v_tenant_status
              );
    END IF;
  END IF;

  -- Idempotency: same state = no-op, no audit
  IF v_previous_state = p_new_is_active THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'academy_id', p_academy_id,
      'current_is_active', v_previous_state
    );
  END IF;

  -- Update
  UPDATE public.academies
  SET is_active = p_new_is_active,
      updated_at = now()
  WHERE id = p_academy_id;

  -- Mandatory audit
  INSERT INTO public.audit_logs (
    event_type, tenant_id, profile_id, category, metadata
  ) VALUES (
    'ACADEMY_STATE_CHANGED',
    v_academy.tenant_id,
    p_actor_profile_id,
    'SECURITY',
    jsonb_build_object(
      'previous_state', v_previous_state,
      'new_state', p_new_is_active,
      'academy_id', p_academy_id,
      'reason', p_reason,
      'actor_profile_id', p_actor_profile_id,
      'pi_reference', 'PI-ACADEMY-GOV-001B',
      'occurred_at', now()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'academy_id', p_academy_id,
    'previous_state', v_previous_state,
    'new_state', p_new_is_active
  );
END;
$$;

-- STEP 2: Add academy cascade to change_tenant_lifecycle_state
CREATE OR REPLACE FUNCTION public.change_tenant_lifecycle_state(
  p_tenant_id uuid,
  p_new_state text,
  p_reason text DEFAULT NULL
) RETURNS text
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

  -- CASCADE: Deactivate all active academies when tenant leaves ACTIVE
  IF p_new_state IN ('SUSPENDED', 'TERMINATED', 'BLOCKED') THEN
    UPDATE public.academies
    SET is_active = false
    WHERE tenant_id = p_tenant_id
      AND is_active = true;
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
