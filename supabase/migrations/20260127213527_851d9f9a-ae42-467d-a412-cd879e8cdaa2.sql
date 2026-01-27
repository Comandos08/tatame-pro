-- =====================================================
-- 🔐 IDENTITY WIZARD — Blocking Flow Database Support
-- =====================================================

-- Add wizard_completed flag to profiles
-- NULL or FALSE = wizard not completed (blocking state)
-- TRUE = wizard completed, tenant resolved
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS wizard_completed BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.wizard_completed IS 
  'Indicates if user completed the identity wizard. FALSE/NULL = blocking state, TRUE = tenant resolved.';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_wizard_completed 
ON public.profiles(wizard_completed) 
WHERE wizard_completed = FALSE;

-- Update existing profiles that have tenant_id set to mark wizard as completed
-- (retroactive fix for existing users)
UPDATE public.profiles 
SET wizard_completed = TRUE 
WHERE tenant_id IS NOT NULL;

-- Update existing profiles that are linked to athletes to mark wizard as completed
UPDATE public.profiles p
SET wizard_completed = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.athletes a WHERE a.profile_id = p.id
);

-- Update existing profiles with admin roles to mark wizard as completed
UPDATE public.profiles p
SET wizard_completed = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = p.id 
  AND ur.role IN ('ADMIN_TENANT', 'STAFF_ORGANIZACAO', 'SUPERADMIN_GLOBAL')
);

-- Create function to check if user has completed wizard
CREATE OR REPLACE FUNCTION public.user_has_completed_wizard(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT wizard_completed FROM public.profiles WHERE id = _user_id),
    FALSE
  )
$$;

-- Create function to check if user has valid tenant context
CREATE OR REPLACE FUNCTION public.user_has_tenant_context(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Has tenant_id on profile
    SELECT 1 FROM public.profiles WHERE id = _user_id AND tenant_id IS NOT NULL
  ) OR EXISTS (
    -- Is linked to an athlete
    SELECT 1 FROM public.athletes WHERE profile_id = _user_id
  ) OR EXISTS (
    -- Has a tenant role
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND tenant_id IS NOT NULL
  ) OR EXISTS (
    -- Is global superadmin (special case - doesn't need tenant)
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'SUPERADMIN_GLOBAL'
  )
$$;