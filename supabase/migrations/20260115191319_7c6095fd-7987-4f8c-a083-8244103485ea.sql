-- Create password_resets table for secure password recovery
CREATE TABLE public.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '1 hour'),
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast token lookups
CREATE INDEX idx_password_resets_token ON public.password_resets(token);
CREATE INDEX idx_password_resets_email ON public.password_resets(email);
CREATE INDEX idx_password_resets_expires_at ON public.password_resets(expires_at);

-- Enable RLS
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- Only service role can manage password resets (edge functions)
-- No user policies needed as this is handled by edge functions

-- Add webhook_processed_at to memberships for idempotent webhook handling
ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS webhook_processed_at TIMESTAMP WITH TIME ZONE;

-- Create webhook_events table for audit trail
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'processed',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Create trigger for updated_at on password_resets
CREATE TRIGGER update_password_resets_updated_at
  BEFORE UPDATE ON public.password_resets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();