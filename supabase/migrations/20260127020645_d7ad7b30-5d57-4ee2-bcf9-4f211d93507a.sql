-- ============================================================================
-- GAP 7: IMMUTABILITY, INTEGRITY & GOVERNANCE
-- ============================================================================

-- 1️⃣ CREATE DECISION_LOGS TABLE
-- ============================================================================

CREATE TABLE public.decision_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_type TEXT NOT NULL,
  severity security_severity NOT NULL DEFAULT 'MEDIUM',
  operation TEXT,
  user_id UUID REFERENCES public.profiles(id),
  tenant_id UUID REFERENCES public.tenants(id),
  reason_code TEXT NOT NULL,
  previous_hash TEXT,
  current_hash TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for hash chain verification
CREATE INDEX idx_decision_logs_tenant_hash ON public.decision_logs(tenant_id, created_at DESC);
CREATE INDEX idx_decision_logs_type ON public.decision_logs(decision_type);
CREATE INDEX idx_decision_logs_user ON public.decision_logs(user_id);

-- Add comment
COMMENT ON TABLE public.decision_logs IS 'Immutable log of security decisions (blocks, denials) with hash chain integrity';

-- 2️⃣ ENABLE RLS ON ALL LOG TABLES
-- ============================================================================

ALTER TABLE public.decision_logs ENABLE ROW LEVEL SECURITY;

-- 3️⃣ IMMUTABILITY POLICIES - PREVENT UPDATE/DELETE
-- ============================================================================

-- decision_logs: No updates or deletes allowed
CREATE POLICY "decision_logs_no_update"
ON public.decision_logs
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "decision_logs_no_delete"
ON public.decision_logs
FOR DELETE
TO authenticated
USING (false);

-- audit_logs: No updates or deletes allowed (reinforce existing)
CREATE POLICY "audit_logs_no_update"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "audit_logs_no_delete"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (false);

-- security_events: Already has no UPDATE/DELETE policies, but let's be explicit
CREATE POLICY "security_events_no_update"
ON public.security_events
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "security_events_no_delete"
ON public.security_events
FOR DELETE
TO authenticated
USING (false);

-- 4️⃣ READ POLICIES - TENANT ISOLATION
-- ============================================================================

-- decision_logs: Tenant admins can view their own tenant's logs
CREATE POLICY "decision_logs_tenant_admin_select"
ON public.decision_logs
FOR SELECT
TO authenticated
USING (
  (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id))
  OR is_superadmin()
);

-- decision_logs: Service role can insert (Edge Functions only)
CREATE POLICY "decision_logs_service_insert"
ON public.decision_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- 5️⃣ ADD HASH COLUMNS TO SECURITY_EVENTS (for future integrity)
-- ============================================================================

ALTER TABLE public.security_events 
ADD COLUMN IF NOT EXISTS previous_hash TEXT,
ADD COLUMN IF NOT EXISTS current_hash TEXT;

-- 6️⃣ CREATE FUNCTION TO VERIFY HASH CHAIN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_decision_log_chain(p_tenant_id UUID)
RETURNS TABLE(
  log_id UUID,
  is_valid BOOLEAN,
  expected_previous TEXT,
  actual_previous TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_hash TEXT := NULL;
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT id, previous_hash, current_hash
    FROM decision_logs
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at ASC
  LOOP
    log_id := rec.id;
    expected_previous := prev_hash;
    actual_previous := rec.previous_hash;
    is_valid := (prev_hash IS NOT DISTINCT FROM rec.previous_hash);
    prev_hash := rec.current_hash;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.verify_decision_log_chain(UUID) TO authenticated;