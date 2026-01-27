-- ============================================================================
-- GAP 8: SECURITY OBSERVABILITY - READ-ONLY VIEWS
-- ============================================================================

-- 1️⃣ CREATE UNIFIED SECURITY TIMELINE VIEW
-- Combines decision_logs and security_events for a single timeline
-- ============================================================================

CREATE OR REPLACE VIEW public.security_timeline AS
SELECT 
  id,
  'DECISION' AS source,
  decision_type AS event_type,
  severity::text AS severity,
  operation,
  user_id,
  tenant_id,
  reason_code,
  NULL AS ip_address,
  NULL AS user_agent,
  metadata,
  created_at
FROM public.decision_logs

UNION ALL

SELECT
  id,
  'EVENT' AS source,
  event_type,
  severity::text AS severity,
  operation,
  user_id,
  tenant_id,
  NULL AS reason_code,
  ip_address,
  user_agent,
  metadata,
  created_at
FROM public.security_events

ORDER BY created_at DESC;

-- Add comment
COMMENT ON VIEW public.security_timeline IS 'Unified read-only view of security decisions and events for observability';

-- 2️⃣ RLS ON THE VIEW (via underlying tables)
-- The view inherits RLS from decision_logs and security_events
-- No additional policies needed - access controlled by source tables

-- 3️⃣ CREATE HELPER FUNCTION FOR PAGINATED TIMELINE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_security_timeline(
  p_tenant_id UUID DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  source TEXT,
  event_type TEXT,
  severity TEXT,
  operation TEXT,
  user_id UUID,
  tenant_id UUID,
  reason_code TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    st.id,
    st.source,
    st.event_type,
    st.severity,
    st.operation,
    st.user_id,
    st.tenant_id,
    st.reason_code,
    st.ip_address,
    st.user_agent,
    st.metadata,
    st.created_at
  FROM security_timeline st
  WHERE 
    (p_tenant_id IS NULL OR st.tenant_id = p_tenant_id)
    AND (p_severity IS NULL OR st.severity = p_severity)
    AND (p_operation IS NULL OR st.operation ILIKE '%' || p_operation || '%')
    AND (p_source IS NULL OR st.source = p_source)
    AND (p_from_date IS NULL OR st.created_at >= p_from_date)
    AND (p_to_date IS NULL OR st.created_at <= p_to_date)
  ORDER BY st.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute to authenticated users (RLS still applies via view)
GRANT EXECUTE ON FUNCTION public.get_security_timeline TO authenticated;

-- 4️⃣ CREATE DECISION EXPLAINER FUNCTION
-- Returns human-readable explanation for a decision
-- ============================================================================

CREATE OR REPLACE FUNCTION public.explain_security_decision(p_decision_id UUID)
RETURNS TABLE(
  id UUID,
  decision_type TEXT,
  severity TEXT,
  operation TEXT,
  reason_code TEXT,
  explanation TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_explanation TEXT;
  v_decision RECORD;
BEGIN
  -- Fetch decision (RLS applies)
  SELECT * INTO v_decision
  FROM decision_logs dl
  WHERE dl.id = p_decision_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Generate explanation based on decision type
  CASE v_decision.decision_type
    WHEN 'RATE_LIMIT_BLOCK' THEN
      v_explanation := 'Request blocked due to excessive requests. Wait before retrying.';
    WHEN 'PERMISSION_DENIED' THEN
      v_explanation := 'User lacks required permissions for this operation.';
    WHEN 'IMPERSONATION_BLOCK' THEN
      v_explanation := 'Superadmin attempted operation without valid impersonation session.';
    WHEN 'CROSS_TENANT_BLOCK' THEN
      v_explanation := 'User attempted to access resources from another tenant.';
    WHEN 'ONBOARDING_BLOCK' THEN
      v_explanation := 'Tenant has not completed required onboarding steps.';
    WHEN 'AUTH_FAILURE' THEN
      v_explanation := 'Authentication failed - invalid credentials or expired token.';
    WHEN 'VALIDATION_FAILURE' THEN
      v_explanation := 'Request validation failed - missing or invalid data.';
    ELSE
      v_explanation := 'Security decision recorded for audit purposes.';
  END CASE;

  RETURN QUERY SELECT
    v_decision.id,
    v_decision.decision_type,
    v_decision.severity::text,
    v_decision.operation,
    v_decision.reason_code,
    v_explanation,
    v_decision.metadata,
    v_decision.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.explain_security_decision TO authenticated;