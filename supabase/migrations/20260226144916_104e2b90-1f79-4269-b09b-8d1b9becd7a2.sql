CREATE POLICY "Members can view own tenant billing status"
  ON public.tenant_billing
  FOR SELECT
  TO authenticated
  USING (
    public.is_member_of_tenant(tenant_id)
  );