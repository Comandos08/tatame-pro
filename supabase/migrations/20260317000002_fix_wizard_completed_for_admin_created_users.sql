-- =============================================================================
-- FIX: wizard_completed for admin-created users
-- =============================================================================
-- Root cause: create-tenant-admin and admin-create-user Edge Functions never
-- set wizard_completed = true after creating users. This caused all admin-created
-- tenant admins and athletes to be redirected to the identity wizard on login
-- instead of their tenant app.
--
-- This migration retroactively fixes any users who:
--   - Have an ADMIN_TENANT or ATLETA role in user_roles (so they have a tenant)
--   - Still have wizard_completed = false or NULL
-- =============================================================================

-- Fix admin-created tenant admins: have ADMIN_TENANT role but wizard_completed = false
UPDATE public.profiles p
SET wizard_completed = TRUE
WHERE wizard_completed IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role = 'ADMIN_TENANT'
  );

-- Fix admin-created athletes: have ATLETA role but wizard_completed = false
UPDATE public.profiles p
SET wizard_completed = TRUE
WHERE wizard_completed IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role = 'ATLETA'
  );

-- Fix any other users with roles but wizard_completed still false
-- (covers STAFF_ORGANIZACAO, INSTRUTOR, COACH_PRINCIPAL, etc.)
UPDATE public.profiles p
SET wizard_completed = TRUE
WHERE wizard_completed IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.tenant_id IS NOT NULL
  );
