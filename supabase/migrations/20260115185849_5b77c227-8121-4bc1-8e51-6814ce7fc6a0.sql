-- Add current academy and coach fields to athletes table
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS current_academy_id UUID REFERENCES public.academies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_main_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_athletes_current_academy ON public.athletes(current_academy_id);
CREATE INDEX IF NOT EXISTS idx_athletes_tenant_id ON public.athletes(tenant_id);

-- Add RLS policy for staff to view all athletes in their tenant
CREATE POLICY "Staff can view tenant athletes"
  ON public.athletes FOR SELECT
  USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id));

-- Add RLS policy for head coaches to view athletes in their academies
CREATE POLICY "Head coaches can view academy athletes"
  ON public.athletes FOR SELECT
  USING (
    current_academy_id IS NOT NULL 
    AND is_head_coach_of_academy(current_academy_id)
  );