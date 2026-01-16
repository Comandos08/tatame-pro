-- Add column to track trial end notification sent status
ALTER TABLE public.tenant_billing 
ADD COLUMN IF NOT EXISTS trial_end_notification_sent boolean DEFAULT false;

-- Reset the flag when a new subscription/trial is created
-- This is handled in the create-tenant-subscription edge function