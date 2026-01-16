-- Add renewal_reminder_sent flag to memberships table
ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS renewal_reminder_sent boolean DEFAULT false;

-- Create index for efficient renewal reminder queries
CREATE INDEX IF NOT EXISTS idx_memberships_renewal_reminder 
ON public.memberships (end_date, renewal_reminder_sent) 
WHERE status IN ('ACTIVE', 'APPROVED') AND renewal_reminder_sent = false;