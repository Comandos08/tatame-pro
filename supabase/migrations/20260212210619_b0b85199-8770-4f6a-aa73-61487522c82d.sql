
-- SAFE GOLD: Restrict user_roles mutations to service_role only
-- This ensures all role changes go through audited Edge Functions

-- Drop existing INSERT/UPDATE/DELETE policies on user_roles
DROP POLICY IF EXISTS "Tenant admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Service role can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "service_role_insert_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "service_role_update_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "service_role_delete_user_roles" ON public.user_roles;

-- Create service_role-only mutation policies
CREATE POLICY "service_role_insert_user_roles"
ON public.user_roles
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "service_role_update_user_roles"
ON public.user_roles
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_delete_user_roles"
ON public.user_roles
FOR DELETE
TO service_role
USING (true);
