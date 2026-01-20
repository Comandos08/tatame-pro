-- =====================================================================
-- Add Manual Override Tracking to tenant_billing
-- =====================================================================
-- These columns track when billing status is manually overridden by admins
-- rather than being controlled by Stripe webhooks.
-- =====================================================================

-- Add override tracking columns
ALTER TABLE public.tenant_billing
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS override_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.tenant_billing.is_manual_override IS 
'True when billing status has been manually overridden by a superadmin instead of being controlled by Stripe';

COMMENT ON COLUMN public.tenant_billing.override_by IS 
'UUID of the superadmin who performed the manual override';

COMMENT ON COLUMN public.tenant_billing.override_at IS 
'Timestamp when the manual override was applied';

COMMENT ON COLUMN public.tenant_billing.override_reason IS 
'Reason provided by the superadmin for the manual override';