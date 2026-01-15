-- Create enum for diploma status
CREATE TYPE public.diploma_status AS ENUM ('DRAFT', 'ISSUED', 'REVOKED');

-- 1. Grading Schemes table (defines graduation system per tenant/sport)
CREATE TABLE public.grading_schemes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sport_type TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Enable RLS
ALTER TABLE public.grading_schemes ENABLE ROW LEVEL SECURITY;

-- RLS policies for grading_schemes
CREATE POLICY "Public can view active grading schemes"
  ON public.grading_schemes FOR SELECT
  USING (is_active = true);

CREATE POLICY "Superadmin full access to grading_schemes"
  ON public.grading_schemes FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage grading_schemes"
  ON public.grading_schemes FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can manage grading_schemes"
  ON public.grading_schemes FOR ALL
  USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id))
  WITH CHECK (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id));

-- 2. Grading Levels table (levels/belts within a scheme)
CREATE TABLE public.grading_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  grading_scheme_id UUID NOT NULL REFERENCES public.grading_schemes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  min_time_months INTEGER,
  min_age INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(grading_scheme_id, code)
);

-- Enable RLS
ALTER TABLE public.grading_levels ENABLE ROW LEVEL SECURITY;

-- RLS policies for grading_levels
CREATE POLICY "Public can view active grading levels"
  ON public.grading_levels FOR SELECT
  USING (is_active = true);

CREATE POLICY "Superadmin full access to grading_levels"
  ON public.grading_levels FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage grading_levels"
  ON public.grading_levels FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can manage grading_levels"
  ON public.grading_levels FOR ALL
  USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id))
  WITH CHECK (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id));

-- 3. Athlete Gradings table (promotion history)
CREATE TABLE public.athlete_gradings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  grading_level_id UUID NOT NULL REFERENCES public.grading_levels(id) ON DELETE RESTRICT,
  academy_id UUID REFERENCES public.academies(id) ON DELETE SET NULL,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  promotion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  diploma_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.athlete_gradings ENABLE ROW LEVEL SECURITY;

-- RLS policies for athlete_gradings
CREATE POLICY "Superadmin full access to athlete_gradings"
  ON public.athlete_gradings FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage athlete_gradings"
  ON public.athlete_gradings FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can manage athlete_gradings"
  ON public.athlete_gradings FOR ALL
  USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id))
  WITH CHECK (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id));

CREATE POLICY "Head coaches can manage gradings for their academy athletes"
  ON public.athlete_gradings FOR ALL
  USING (academy_id IS NOT NULL AND is_head_coach_of_academy(academy_id))
  WITH CHECK (academy_id IS NOT NULL AND is_head_coach_of_academy(academy_id));

CREATE POLICY "Athletes can view own gradings"
  ON public.athlete_gradings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.athletes a
    WHERE a.id = athlete_gradings.athlete_id
      AND a.profile_id = auth.uid()
  ));

-- 4. Diplomas table
CREATE TABLE public.diplomas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  grading_level_id UUID NOT NULL REFERENCES public.grading_levels(id) ON DELETE RESTRICT,
  academy_id UUID REFERENCES public.academies(id) ON DELETE SET NULL,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  promotion_date DATE NOT NULL,
  serial_number TEXT NOT NULL,
  pdf_url TEXT,
  qr_code_data TEXT,
  qr_code_image_url TEXT,
  status diploma_status NOT NULL DEFAULT 'DRAFT',
  revoked_reason TEXT,
  issued_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, serial_number)
);

-- Enable RLS
ALTER TABLE public.diplomas ENABLE ROW LEVEL SECURITY;

-- RLS policies for diplomas
CREATE POLICY "Superadmin full access to diplomas"
  ON public.diplomas FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "Tenant admin can manage diplomas"
  ON public.diplomas FOR ALL
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can manage diplomas"
  ON public.diplomas FOR ALL
  USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id))
  WITH CHECK (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id));

CREATE POLICY "Head coaches can manage diplomas for their academy"
  ON public.diplomas FOR ALL
  USING (academy_id IS NOT NULL AND is_head_coach_of_academy(academy_id))
  WITH CHECK (academy_id IS NOT NULL AND is_head_coach_of_academy(academy_id));

CREATE POLICY "Athletes can view own diplomas"
  ON public.diplomas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.athletes a
    WHERE a.id = diplomas.athlete_id
      AND a.profile_id = auth.uid()
  ));

-- Add foreign key from athlete_gradings to diplomas (after diplomas table exists)
ALTER TABLE public.athlete_gradings
  ADD CONSTRAINT athlete_gradings_diploma_id_fkey
  FOREIGN KEY (diploma_id) REFERENCES public.diplomas(id) ON DELETE SET NULL;

-- Create function to get next diploma serial number for a tenant
CREATE OR REPLACE FUNCTION public.get_next_diploma_serial(p_tenant_id UUID, p_sport_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
  v_prefix TEXT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_prefix := UPPER(SUBSTRING(p_sport_type FROM 1 FOR 3));
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.diplomas
  WHERE tenant_id = p_tenant_id
    AND serial_number LIKE v_prefix || '-' || v_year || '-%';
  
  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$;

-- Add triggers for updated_at
CREATE TRIGGER update_grading_schemes_updated_at
  BEFORE UPDATE ON public.grading_schemes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_grading_levels_updated_at
  BEFORE UPDATE ON public.grading_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_athlete_gradings_updated_at
  BEFORE UPDATE ON public.athlete_gradings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_diplomas_updated_at
  BEFORE UPDATE ON public.diplomas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();