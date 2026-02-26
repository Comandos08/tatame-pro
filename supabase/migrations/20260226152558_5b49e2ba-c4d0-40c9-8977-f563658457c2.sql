
CREATE OR REPLACE FUNCTION public.get_my_profile_with_roles()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_roles jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, tenant_id, email, name, avatar_url, created_at, updated_at
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'userId', r.user_id,
    'role', r.role::text,
    'tenantId', r.tenant_id,
    'createdAt', r.created_at
  )), '[]'::jsonb)
  INTO v_roles
  FROM public.user_roles r
  WHERE r.user_id = v_user_id;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'tenantId', v_profile.tenant_id,
    'email', coalesce(v_profile.email, ''),
    'name', v_profile.name,
    'avatarUrl', v_profile.avatar_url,
    'createdAt', coalesce(v_profile.created_at::text, ''),
    'updatedAt', coalesce(v_profile.updated_at::text, ''),
    'roles', v_roles
  );
END;
$$;
