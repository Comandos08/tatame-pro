-- Phase 4: Account lockout mechanism (P1-13)
-- Tracks failed login attempts per email with automatic lockout

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lockout queries (recent failures by email)
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created
  ON public.login_attempts(email, created_at DESC);

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_login_attempts_created
  ON public.login_attempts(created_at);

-- Auto-cleanup: remove attempts older than 24 hours (via scheduled job)
-- The edge function checks: 5 failures in 15 minutes = locked

-- RLS: only service role can access
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- No policies = only service_role can access (secure by default)
