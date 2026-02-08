-- P4.3.1 — Dismissed Alerts Table (READ-ONLY PREPARATION)
-- 
-- This table prepares for future server-side dismiss persistence.
-- IMPORTANT: Currently READ-ONLY - no INSERT/UPDATE operations are active.
-- localStorage remains the primary source of truth.
--
-- Future activation requires:
-- 1. PI approval
-- 2. Feature flag enablement
-- 3. Merge logic implementation

CREATE TABLE IF NOT EXISTS public.observability_dismissed_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Metadata for future analytics
  source TEXT NOT NULL DEFAULT 'client', -- 'client' | 'server' | 'sync'
  
  -- Prevent duplicate dismissals
  CONSTRAINT unique_user_alert UNIQUE (user_id, alert_id)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_dismissed_alerts_user 
  ON public.observability_dismissed_alerts(user_id);

-- Index for cleanup jobs (future)
CREATE INDEX IF NOT EXISTS idx_dismissed_alerts_timestamp 
  ON public.observability_dismissed_alerts(dismissed_at);

-- Enable RLS
ALTER TABLE public.observability_dismissed_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only SELECT their own dismissed alerts
-- NO INSERT/UPDATE/DELETE policies = read-only for now
CREATE POLICY "Users can view their own dismissed alerts"
  ON public.observability_dismissed_alerts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add comment documenting the read-only nature
COMMENT ON TABLE public.observability_dismissed_alerts IS 
  'P4.3.1: Server-side dismiss persistence (READ-ONLY preparation). localStorage is primary source. No INSERT/UPDATE active.';

-- SAFE GOLD: No INSERT/UPDATE/DELETE policies means this table is
-- effectively read-only until explicitly activated in a future PI.