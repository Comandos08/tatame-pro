
-- ============================================================
-- PI-INSTITUTIONAL-ROLE-GOV-002C — Structural Enforcement
-- Step 1: Create 3 gatekeeper SECURITY DEFINER functions
-- Step 2: GRANT EXECUTE to service_role only
-- Step 3: REVOKE direct INSERT/UPDATE/DELETE from all app roles
-- ============================================================

-- 1A. grant_admin_tenant_role() — exclusive gatekeeper for ADMIN_TENANT
CREATE OR REPLACE FUNCTION public.grant_admin_tenant_role(
  p_user_id uuid,
  p_tenant_id uuid,
  p_bypass_membership_check boolean DEFAULT false
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_existing_id uuid;
  v_role_id uuid;
  v_has_approved_membership boolean;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND tenant_id = p_tenant_id
    AND role = 'ADMIN_TENANT';

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  IF NOT p_bypass_membership_check THEN
    SELECT EXISTS (
      SELECT 1 FROM public.memberships
      WHERE applicant_profile_id = p_user_id
        AND tenant_id = p_tenant_id
        AND status = 'APPROVED'
    ) INTO v_has_approved_membership;

    IF NOT v_has_approved_membership THEN
      RAISE EXCEPTION
        'ADMIN_TENANT requires APPROVED membership in tenant %. User % has none.',
        p_tenant_id, p_user_id;
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (p_user_id, p_tenant_id, 'ADMIN_TENANT')
  RETURNING id INTO v_role_id;

  INSERT INTO public.audit_logs (
    event_type, tenant_id, profile_id, category, metadata
  ) VALUES (
    'ADMIN_TENANT_ROLE_GRANTED',
    p_tenant_id,
    p_user_id,
    'SECURITY',
    jsonb_build_object(
      'user_roles_id', v_role_id,
      'bypass_membership_check', p_bypass_membership_check,
      'pi_reference', 'PI-002C',
      'occurred_at', now()
    )
  );

  RETURN v_role_id;
END;
$$;

-- 1B. grant_user_role() — for non-ADMIN_TENANT roles
CREATE OR REPLACE FUNCTION public.grant_user_role(
  p_user_id uuid,
  p_tenant_id uuid,
  p_role text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_existing_id uuid;
  v_role_id uuid;
BEGIN
  IF p_role = 'ADMIN_TENANT' THEN
    RAISE EXCEPTION '[PI-002C] ADMIN_TENANT cannot be granted via grant_user_role(). Use grant_admin_tenant_role().';
  END IF;

  BEGIN
    PERFORM p_role::public.app_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END;

  SELECT id INTO v_existing_id
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND tenant_id = p_tenant_id
    AND role = p_role::public.app_role;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (p_user_id, p_tenant_id, p_role::public.app_role)
  RETURNING id INTO v_role_id;

  RETURN v_role_id;
END;
$$;

-- 1C. revoke_user_role() — DELETE gatekeeper
CREATE OR REPLACE FUNCTION public.revoke_user_role(
  p_user_id uuid,
  p_tenant_id uuid,
  p_role text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  BEGIN
    PERFORM p_role::public.app_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END;

  SELECT id INTO v_role_id
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND tenant_id = p_tenant_id
    AND role = p_role::public.app_role;

  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_roles WHERE id = v_role_id;

  RETURN true;
END;
$$;

-- 2. GRANT EXECUTE only to service_role
REVOKE ALL ON FUNCTION public.grant_admin_tenant_role(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_user_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_user_role(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.grant_admin_tenant_role(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_user_role(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_role(uuid, uuid, text) TO service_role;

-- 3. REVOKE direct mutation privileges
REVOKE INSERT ON public.user_roles FROM anon;
REVOKE UPDATE ON public.user_roles FROM anon;
REVOKE DELETE ON public.user_roles FROM anon;

REVOKE INSERT ON public.user_roles FROM authenticated;
REVOKE UPDATE ON public.user_roles FROM authenticated;
REVOKE DELETE ON public.user_roles FROM authenticated;

REVOKE INSERT ON public.user_roles FROM service_role;
REVOKE UPDATE ON public.user_roles FROM service_role;
REVOKE DELETE ON public.user_roles FROM service_role;
