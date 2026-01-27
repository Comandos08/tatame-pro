-- ============================================
-- SUPERADMIN IMPERSONATION TABLE + RLS
-- Tracks scoped, time-limited impersonation sessions
-- ============================================

-- Create the superadmin_impersonations table
CREATE TABLE public.superadmin_impersonations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_user_id UUID NOT NULL,
  target_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED', 'EXPIRED', 'REVOKED')),
  reason TEXT NULL,
  metadata JSONB NULL DEFAULT '{}'::jsonb,
  created_by_profile_id UUID NULL REFERENCES public.profiles(id),
  ended_by_profile_id UUID NULL REFERENCES public.profiles(id)
);

-- Create indexes for fast lookup
CREATE INDEX idx_impersonations_superadmin ON public.superadmin_impersonations(superadmin_user_id);
CREATE INDEX idx_impersonations_tenant ON public.superadmin_impersonations(target_tenant_id);
CREATE INDEX idx_impersonations_status ON public.superadmin_impersonations(status) WHERE status = 'ACTIVE';
CREATE INDEX idx_impersonations_expires ON public.superadmin_impersonations(expires_at) WHERE status = 'ACTIVE';

-- Enable RLS
ALTER TABLE public.superadmin_impersonations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only SUPERADMIN_GLOBAL (tenant_id IS NULL) can manage their own sessions
CREATE POLICY "superadmin_manage_own_sessions"
ON public.superadmin_impersonations
FOR ALL
USING (
  superadmin_user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND tenant_id IS NULL 
    AND role = 'SUPERADMIN_GLOBAL'
  )
)
WITH CHECK (
  superadmin_user_id = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND tenant_id IS NULL 
    AND role = 'SUPERADMIN_GLOBAL'
  )
);

-- Policy: Service role has full access (for edge functions)
CREATE POLICY "service_role_full_access"
ON public.superadmin_impersonations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add new audit event types to track impersonation
COMMENT ON TABLE public.superadmin_impersonations IS 
'Tracks superadmin impersonation sessions with TTL, scoping, and audit trail. 
Sessions are time-limited (max 60 min) and scoped to a specific tenant.
Status: ACTIVE (in progress), ENDED (manually stopped), EXPIRED (TTL passed), REVOKED (admin cancelled).';