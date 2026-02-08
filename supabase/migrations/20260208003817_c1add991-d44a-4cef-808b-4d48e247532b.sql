-- Add cancellation tracking columns for manual cancellation (P3.MEMBERSHIP.MANUAL.CANCEL)
ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS cancelled_by_profile_id UUID REFERENCES auth.users(id);

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add index for performance on cancellation queries
CREATE INDEX IF NOT EXISTS idx_memberships_cancelled_at 
ON public.memberships(cancelled_at) 
WHERE cancelled_at IS NOT NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.memberships.cancelled_at IS 'Timestamp when membership was manually cancelled';
COMMENT ON COLUMN public.memberships.cancelled_by_profile_id IS 'Profile ID of admin who cancelled the membership';
COMMENT ON COLUMN public.memberships.cancellation_reason IS 'Reason for manual cancellation (semantic separation from review_notes)';