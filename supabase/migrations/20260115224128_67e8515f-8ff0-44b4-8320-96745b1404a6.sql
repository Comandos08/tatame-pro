-- Add billing_email to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS billing_email TEXT;

-- Create tenant_invoices table for invoice history
CREATE TABLE public.tenant_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL DEFAULT 'draft',
  due_date TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  hosted_invoice_url TEXT,
  invoice_pdf TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_tenant_invoices_tenant_id ON public.tenant_invoices(tenant_id);
CREATE INDEX idx_tenant_invoices_stripe_invoice_id ON public.tenant_invoices(stripe_invoice_id);
CREATE INDEX idx_tenant_invoices_status ON public.tenant_invoices(status);

-- Enable RLS
ALTER TABLE public.tenant_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_invoices
-- Superadmins can see all invoices
CREATE POLICY "Superadmins can view all invoices"
ON public.tenant_invoices
FOR SELECT
USING (public.is_superadmin());

-- Tenant admins and staff can view their own invoices
CREATE POLICY "Tenant admins can view their invoices"
ON public.tenant_invoices
FOR SELECT
USING (
  public.is_tenant_admin(tenant_id) OR
  public.has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id)
);

-- Only system (service role) can insert/update invoices
CREATE POLICY "Service role can manage invoices"
ON public.tenant_invoices
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add trigger for updated_at
CREATE TRIGGER update_tenant_invoices_updated_at
BEFORE UPDATE ON public.tenant_invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();