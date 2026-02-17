
-- PI-ACADEMY-GOV-001B — Gatekeeper + Column-Level Lockdown (SAFE GOLD)

-- ============================================================
-- STEP 1: Gatekeeper — change_academy_state
-- ============================================================
CREATE OR REPLACE FUNCTION public.change_academy_state(
  p_academy_id uuid,
  p_new_is_active boolean,
  p_reason text,
  p_actor_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_academy record;
  v_previous_state boolean;
BEGIN
  -- Lock row
  SELECT * INTO v_academy FROM public.academies WHERE id = p_academy_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academy % not found.', p_academy_id;
  END IF;

  v_previous_state := v_academy.is_active;

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

-- ============================================================
-- STEP 2: Gatekeeper — manage_academy_coach_binding
-- ============================================================
CREATE OR REPLACE FUNCTION public.manage_academy_coach_binding(
  p_academy_id uuid,
  p_coach_id uuid,
  p_role text,
  p_is_active boolean,
  p_actor_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_academy record;
  v_coach record;
  v_binding record;
  v_binding_exists boolean;
  v_action text;
BEGIN
  -- Validate academy
  SELECT * INTO v_academy FROM public.academies WHERE id = p_academy_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academy % not found.', p_academy_id;
  END IF;

  -- Validate coach
  SELECT * INTO v_coach FROM public.coaches WHERE id = p_coach_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coach % not found.', p_coach_id;
  END IF;

  -- Validate tenant match
  IF v_academy.tenant_id != v_coach.tenant_id THEN
    RAISE EXCEPTION 'Tenant mismatch: academy tenant % != coach tenant %.', v_academy.tenant_id, v_coach.tenant_id;
  END IF;

  -- Validate role against enum
  BEGIN
    PERFORM p_role::public.academy_coach_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid academy_coach_role: %', p_role;
  END;

  -- Check existing binding
  SELECT * INTO v_binding
  FROM public.academy_coaches
  WHERE academy_id = p_academy_id AND coach_id = p_coach_id
  FOR UPDATE;

  v_binding_exists := FOUND;

  -- Idempotency: all fields match = no-op
  IF v_binding_exists
     AND v_binding.role::text = p_role
     AND v_binding.is_active = p_is_active THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'binding_id', v_binding.id,
      'academy_id', p_academy_id,
      'coach_id', p_coach_id
    );
  END IF;

  IF v_binding_exists THEN
    -- Update existing binding
    UPDATE public.academy_coaches
    SET role = p_role::public.academy_coach_role,
        is_active = p_is_active,
        updated_at = now()
    WHERE id = v_binding.id;
    v_action := 'UPDATED';
  ELSE
    -- Insert new binding
    INSERT INTO public.academy_coaches (
      tenant_id, academy_id, coach_id, role, is_active
    ) VALUES (
      v_academy.tenant_id, p_academy_id, p_coach_id,
      p_role::public.academy_coach_role, p_is_active
    );
    v_action := 'CREATED';
  END IF;

  -- Mandatory audit
  INSERT INTO public.audit_logs (
    event_type, tenant_id, profile_id, category, metadata
  ) VALUES (
    'ACADEMY_COACH_BINDING_CHANGED',
    v_academy.tenant_id,
    p_actor_profile_id,
    'SECURITY',
    jsonb_build_object(
      'action', v_action,
      'academy_id', p_academy_id,
      'coach_id', p_coach_id,
      'role', p_role,
      'is_active', p_is_active,
      'actor_profile_id', p_actor_profile_id,
      'pi_reference', 'PI-ACADEMY-GOV-001B',
      'occurred_at', now()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'action', v_action,
    'academy_id', p_academy_id,
    'coach_id', p_coach_id,
    'role', p_role,
    'is_active', p_is_active
  );
END;
$$;

-- ============================================================
-- STEP 3: Column-Level Privilege Lockdown
-- ============================================================

-- Revoke table-level UPDATE
REVOKE UPDATE ON public.academies FROM service_role;
REVOKE UPDATE ON public.academy_coaches FROM service_role;

-- Grant UPDATE only on non-critical columns for academies
GRANT UPDATE (
  name, sport_type, address_line1, address_line2,
  city, state, postal_code, country,
  phone, email, logo_url, slug, updated_at
) ON public.academies TO service_role;

-- Grant UPDATE only on non-critical columns for academy_coaches
GRANT UPDATE (
  role, updated_at
) ON public.academy_coaches TO service_role;

-- Protected columns (only via RPC):
-- academies: is_active, tenant_id, created_at
-- academy_coaches: tenant_id, academy_id, coach_id, is_active, created_at
