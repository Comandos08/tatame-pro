-- =====================================================
-- IPPON TATAME PRO - Multi-tenant Combat Sports SaaS
-- Foundation Migration
-- =====================================================

-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM (
  'SUPERADMIN_GLOBAL',
  'ADMIN_TENANT',
  'STAFF_ORGANIZACAO',
  'COACH_PRINCIPAL',
  'COACH_ASSISTENTE',
  'INSTRUTOR',
  'RECEPCAO',
  'ATLETA',
  'RESPONSAVELLEGAL'
);

-- =====================================================
-- TENANTS TABLE
-- =====================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#dc2626',
  sport_types TEXT[] DEFAULT ARRAY['BJJ'],
  stripe_customer_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for slug lookups
CREATE INDEX idx_tenants_slug ON public.tenants(slug);

-- =====================================================
-- PROFILES TABLE (linked to auth.users)
-- =====================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for profile lookups
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- =====================================================
-- USER ROLES TABLE
-- =====================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role, tenant_id)
);

-- Create indexes for role lookups
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant_id ON public.user_roles(tenant_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- =====================================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- =====================================================

-- Check if user is a global superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'SUPERADMIN_GLOBAL'
      AND tenant_id IS NULL
  )
$$;

-- Check if user has a specific role for a tenant
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role, _tenant_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (tenant_id = _tenant_id OR (_tenant_id IS NULL AND tenant_id IS NULL))
  )
$$;

-- Check if current user is member of a tenant
CREATE OR REPLACE FUNCTION public.is_member_of_tenant(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND tenant_id = _tenant_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
  )
$$;

-- Check if current user is admin of a tenant
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'ADMIN_TENANT', _tenant_id)
$$;

-- Get user's primary tenant ID
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- =====================================================
-- ENABLE RLS
-- =====================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - TENANTS
-- =====================================================

-- Public can read active tenants (for landing pages)
CREATE POLICY "Public can view active tenants"
ON public.tenants
FOR SELECT
USING (is_active = true);

-- Superadmin can do everything
CREATE POLICY "Superadmin full access to tenants"
ON public.tenants
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- Tenant admin can update their own tenant
CREATE POLICY "Tenant admin can update own tenant"
ON public.tenants
FOR UPDATE
TO authenticated
USING (public.is_tenant_admin(id))
WITH CHECK (public.is_tenant_admin(id));

-- =====================================================
-- RLS POLICIES - PROFILES
-- =====================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Users can view profiles in their tenant
CREATE POLICY "Users can view tenant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND public.is_member_of_tenant(tenant_id)
);

-- Superadmin can view all profiles
CREATE POLICY "Superadmin can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_superadmin());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- =====================================================
-- RLS POLICIES - USER ROLES
-- =====================================================

-- Users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Members can view roles in their tenant
CREATE POLICY "Members can view tenant roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND public.is_member_of_tenant(tenant_id)
);

-- Superadmin can manage all roles
CREATE POLICY "Superadmin full access to user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- Tenant admin can manage roles in their tenant
CREATE POLICY "Tenant admin can manage tenant roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND public.is_tenant_admin(tenant_id)
)
WITH CHECK (
  tenant_id IS NOT NULL 
  AND public.is_tenant_admin(tenant_id)
  AND role != 'SUPERADMIN_GLOBAL'
);

-- =====================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- AUTO-UPDATE TIMESTAMPS
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- SEED DEFAULT TENANT FOR TESTING
-- =====================================================
INSERT INTO public.tenants (slug, name, sport_types, primary_color)
VALUES 
  ('demo-bjj', 'Demo BJJ Federation', ARRAY['BJJ'], '#dc2626'),
  ('judo-brasil', 'Federação de Judô', ARRAY['Judo'], '#1e40af');