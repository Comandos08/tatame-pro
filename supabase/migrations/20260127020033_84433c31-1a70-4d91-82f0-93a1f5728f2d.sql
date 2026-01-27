-- ============================================================================
-- GAP 6: Security Events Table
-- Stores security anomalies, rate limit violations, and suspicious activities
-- ============================================================================

-- Create severity enum
CREATE TYPE public.security_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- Create security events table
CREATE TABLE public.security_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity security_severity NOT NULL DEFAULT 'MEDIUM',
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  operation TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only superadmins can read security events
CREATE POLICY "Superadmins can view security events"
ON public.security_events
FOR SELECT
USING (public.is_superadmin());

-- Tenant admins can view their tenant's security events
CREATE POLICY "Tenant admins view own tenant security events"
ON public.security_events
FOR SELECT
USING (
  tenant_id IS NOT NULL 
  AND public.is_tenant_admin(tenant_id)
);

-- No direct inserts from client - only edge functions with service role
-- (RLS INSERT policies intentionally omitted)

-- Create indexes for efficient querying
CREATE INDEX idx_security_events_type ON public.security_events(event_type);
CREATE INDEX idx_security_events_severity ON public.security_events(severity);
CREATE INDEX idx_security_events_user ON public.security_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_security_events_tenant ON public.security_events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_security_events_ip ON public.security_events(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX idx_security_events_created ON public.security_events(created_at DESC);

-- Composite index for anomaly detection queries
CREATE INDEX idx_security_events_anomaly_detection 
ON public.security_events(user_id, event_type, created_at DESC)
WHERE user_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE public.security_events IS 'Security audit trail for rate limiting violations, anomalies, and suspicious activities';