-- Create academy_coach_role enum
CREATE TYPE public.academy_coach_role AS ENUM ('HEAD_COACH', 'ASSISTANT_COACH', 'INSTRUCTOR');

-- Create academies table
CREATE TABLE public.academies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sport_type TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'BR',
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- Create coaches table
CREATE TABLE public.coaches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id),
  full_name TEXT NOT NULL,
  main_sport TEXT,
  rank TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create academy_coaches junction table
CREATE TABLE public.academy_coaches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  academy_id UUID NOT NULL REFERENCES public.academies(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  role public.academy_coach_role NOT NULL DEFAULT 'INSTRUCTOR',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(academy_id, coach_id)
);

-- Add academy and coach references to memberships
ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS academy_id UUID REFERENCES public.academies(id),
ADD COLUMN IF NOT EXISTS preferred_coach_id UUID REFERENCES public.coaches(id);

-- Create indexes
CREATE INDEX idx_academies_tenant ON public.academies(tenant_id);
CREATE INDEX idx_academies_slug ON public.academies(tenant_id, slug);
CREATE INDEX idx_coaches_tenant ON public.coaches(tenant_id);
CREATE INDEX idx_coaches_profile ON public.coaches(profile_id);
CREATE INDEX idx_academy_coaches_academy ON public.academy_coaches(academy_id);
CREATE INDEX idx_academy_coaches_coach ON public.academy_coaches(coach_id);
CREATE INDEX idx_memberships_academy ON public.memberships(academy_id);
CREATE INDEX idx_memberships_coach ON public.memberships(preferred_coach_id);

-- Enable RLS
ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_coaches ENABLE ROW LEVEL SECURITY;

-- Academies RLS policies
CREATE POLICY "Public can view active academies" ON public.academies
  FOR SELECT USING (is_active = true);

CREATE POLICY "Superadmin full access to academies" ON public.academies
  FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage academies" ON public.academies
  FOR ALL USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can manage academies" ON public.academies
  FOR ALL USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id))
  WITH CHECK (has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id));

-- Coaches RLS policies
CREATE POLICY "Tenant members can view coaches" ON public.coaches
  FOR SELECT USING (is_member_of_tenant(tenant_id));

CREATE POLICY "Superadmin full access to coaches" ON public.coaches
  FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage coaches" ON public.coaches
  FOR ALL USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can manage coaches" ON public.coaches
  FOR ALL USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id))
  WITH CHECK (has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id));

CREATE POLICY "Coaches can view own record" ON public.coaches
  FOR SELECT USING (profile_id = auth.uid());

-- Academy_coaches RLS policies
CREATE POLICY "Tenant members can view academy_coaches" ON public.academy_coaches
  FOR SELECT USING (is_member_of_tenant(tenant_id));

CREATE POLICY "Superadmin full access to academy_coaches" ON public.academy_coaches
  FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage academy_coaches" ON public.academy_coaches
  FOR ALL USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can manage academy_coaches" ON public.academy_coaches
  FOR ALL USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id))
  WITH CHECK (has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id));

-- Helper function to check if user is head coach for an academy
CREATE OR REPLACE FUNCTION public.is_head_coach_of_academy(_academy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.academy_coaches ac
    JOIN public.coaches c ON c.id = ac.coach_id
    WHERE ac.academy_id = _academy_id
      AND c.profile_id = auth.uid()
      AND ac.role = 'HEAD_COACH'
      AND ac.is_active = true
      AND c.is_active = true
  )
$$;

-- Helper function to check if user can approve memberships
CREATE OR REPLACE FUNCTION public.can_approve_membership(_membership_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = _membership_id
      AND (
        is_superadmin()
        OR is_tenant_admin(m.tenant_id)
        OR has_role(auth.uid(), 'STAFF_ORGANIZACAO', m.tenant_id)
        OR (m.academy_id IS NOT NULL AND is_head_coach_of_academy(m.academy_id))
      )
  )
$$;

-- Update triggers for new tables
CREATE TRIGGER update_academies_updated_at
  BEFORE UPDATE ON public.academies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coaches_updated_at
  BEFORE UPDATE ON public.coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_academy_coaches_updated_at
  BEFORE UPDATE ON public.academy_coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();