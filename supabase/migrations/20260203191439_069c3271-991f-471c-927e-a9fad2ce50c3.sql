-- P0.2: Add WITH CHECK to memberships UPDATE policy

DROP POLICY IF EXISTS "Staff and admins can update memberships"
ON public.memberships;

CREATE POLICY "Staff and admins can update memberships"
ON public.memberships
FOR UPDATE
USING (
  is_superadmin() 
  OR is_tenant_admin(tenant_id) 
  OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id) 
  OR ((academy_id IS NOT NULL) AND is_head_coach_of_academy(academy_id))
)
WITH CHECK (
  is_superadmin() 
  OR is_tenant_admin(tenant_id) 
  OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, tenant_id) 
  OR ((academy_id IS NOT NULL) AND is_head_coach_of_academy(academy_id))
);