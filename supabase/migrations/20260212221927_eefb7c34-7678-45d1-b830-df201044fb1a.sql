-- ============================================================
-- SAFE GOLD 15/10: Role System Hardening (Definitive Fix)
-- ============================================================

-- 1.1 Expand app_role enum with operational roles (idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'COACH_ASSISTENTE';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'COACH_PRINCIPAL';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'INSTRUTOR';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'STAFF_ORGANIZACAO';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'RECEPCAO';

-- 1.2 Make enforce_canonical_roles() a NO-OP (enum itself enforces validity)
CREATE OR REPLACE FUNCTION public.enforce_canonical_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Role validity is enforced by the app_role enum type constraint.
  -- This trigger is kept as a NO-OP for backward compatibility.
  RETURN NEW;
END;
$$;

-- 1.3 Fix handle_new_user() to never allow empty name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    ''
  )), '');

  IF v_name IS NULL THEN
    v_name := split_part(NEW.email, '@', 1);
  END IF;

  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, v_name);

  RETURN NEW;
END;
$$;

-- 1.4 Consolidate SELECT policy: authenticated + service_role only (no anon)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_scoped" ON public.user_roles;

CREATE POLICY "user_roles_select_scoped"
ON public.user_roles
FOR SELECT
TO authenticated, service_role
USING (
  user_id = auth.uid()
  OR is_superadmin()
  OR (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
);