-- Create billing status enum
CREATE TYPE public.billing_status AS ENUM (
  'ACTIVE',
  'PAST_DUE', 
  'CANCELED',
  'INCOMPLETE',
  'TRIALING',
  'UNPAID'
);

-- Create tenant_billing table
CREATE TABLE public.tenant_billing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_name TEXT NOT NULL DEFAULT 'Plano Federação Anual',
  plan_price_id TEXT NOT NULL DEFAULT 'price_1Spz03HH533PC5DdDUbCe7fS',
  status billing_status NOT NULL DEFAULT 'INCOMPLETE',
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id),
  UNIQUE(stripe_subscription_id)
);

-- Enable RLS
ALTER TABLE public.tenant_billing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Superadmin can do everything
CREATE POLICY "Superadmin full access to tenant_billing"
  ON public.tenant_billing
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Tenant admin and staff can view their own billing
CREATE POLICY "Tenant admin can view own billing"
  ON public.tenant_billing
  FOR SELECT
  USING (is_tenant_admin(tenant_id));

CREATE POLICY "Staff can view tenant billing"
  ON public.tenant_billing
  FOR SELECT
  USING (has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id));

-- Create updated_at trigger
CREATE TRIGGER update_tenant_billing_updated_at
  BEFORE UPDATE ON public.tenant_billing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create helper function to check if tenant has active billing
CREATE OR REPLACE FUNCTION public.tenant_has_active_billing(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_billing
    WHERE tenant_id = _tenant_id
      AND status IN ('ACTIVE', 'TRIALING')
  )
$$;