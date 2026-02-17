
-- PI-MEMBERSHIP-GOV-001A — Wave 1: Structural Foundation
-- Zero triggers, Zero RLS changes, Zero Edge Function changes

-- ============================================================
-- STEP 1: ENUM FIX — Add REJECTED to membership_status
-- ============================================================
ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'REJECTED';

-- ============================================================
-- STEP 2: DRIFT DETECTION VIEW
-- ============================================================
CREATE OR REPLACE VIEW public.membership_governance_audit_v1 AS
WITH issues AS (
  -- P0: APPROVED without PAID
  SELECT m.id AS membership_id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P0_APPROVED_WITHOUT_PAYMENT' AS issue_code, 'P0' AS severity,
    jsonb_build_object('status', m.status, 'payment_status', m.payment_status) AS details,
    now() AS detected_at
  FROM public.memberships m
  WHERE m.status = 'APPROVED' AND m.payment_status IS DISTINCT FROM 'PAID'

  UNION ALL

  -- P0: APPROVED without athlete
  SELECT m.id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P0_APPROVED_WITHOUT_ATHLETE', 'P0',
    jsonb_build_object('status', m.status, 'athlete_id', m.athlete_id),
    now()
  FROM public.memberships m
  WHERE m.status = 'APPROVED' AND m.athlete_id IS NULL

  UNION ALL

  -- P0: APPROVED without reviewer
  SELECT m.id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P0_APPROVED_WITHOUT_REVIEWER', 'P0',
    jsonb_build_object('status', m.status, 'reviewed_by_profile_id', m.reviewed_by_profile_id),
    now()
  FROM public.memberships m
  WHERE m.status = 'APPROVED' AND m.reviewed_by_profile_id IS NULL

  UNION ALL

  -- P0: EXPIRED without end_date
  SELECT m.id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P0_EXPIRED_WITHOUT_END_DATE', 'P0',
    jsonb_build_object('status', m.status, 'end_date', m.end_date),
    now()
  FROM public.memberships m
  WHERE m.status = 'EXPIRED' AND m.end_date IS NULL

  UNION ALL

  -- P0: PAID but still in DRAFT or PENDING_PAYMENT
  SELECT m.id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P0_INVALID_STATUS_COMBO', 'P0',
    jsonb_build_object('status', m.status, 'payment_status', m.payment_status),
    now()
  FROM public.memberships m
  WHERE m.payment_status = 'PAID' AND m.status IN ('DRAFT', 'PENDING_PAYMENT')

  UNION ALL

  -- P1: APPROVED with reviewed_at NULL
  SELECT m.id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P1_REVIEWED_AT_NULL_ON_APPROVED', 'P1',
    jsonb_build_object('status', m.status, 'reviewed_at', m.reviewed_at),
    now()
  FROM public.memberships m
  WHERE m.status = 'APPROVED' AND m.reviewed_at IS NULL

  UNION ALL

  -- P1: CANCELLED without reason
  SELECT m.id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P1_CANCELLED_WITHOUT_REASON', 'P1',
    jsonb_build_object('status', m.status, 'cancellation_reason', m.cancellation_reason),
    now()
  FROM public.memberships m
  WHERE m.status = 'CANCELLED' AND m.cancellation_reason IS NULL

  UNION ALL

  -- P1: PENDING_REVIEW with payment not PAID
  SELECT m.id, m.tenant_id, m.athlete_id, m.status::text, m.payment_status::text,
    'P1_PENDING_REVIEW_WITH_PAYMENT_NOT_PAID', 'P1',
    jsonb_build_object('status', m.status, 'payment_status', m.payment_status),
    now()
  FROM public.memberships m
  WHERE m.status = 'PENDING_REVIEW' AND m.payment_status IS DISTINCT FROM 'PAID'
)
SELECT membership_id, tenant_id, athlete_id, status, payment_status,
  issue_code, severity, details, detected_at
FROM issues;

-- ============================================================
-- STEP 3: CHECK FUNCTION (STABLE, no SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_membership_governance_v1()
RETURNS TABLE(
  membership_id uuid,
  tenant_id uuid,
  athlete_id uuid,
  status text,
  payment_status text,
  issue_code text,
  severity text,
  details jsonb,
  detected_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.membership_governance_audit_v1;
$$;

-- ============================================================
-- STEP 4: GATEKEEPER — change_membership_state
-- ============================================================
CREATE OR REPLACE FUNCTION public.change_membership_state(
  p_membership_id uuid,
  p_new_status text,
  p_reason text,
  p_actor_profile_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_membership RECORD;
  v_previous_status text;
  v_allowed text[];
BEGIN
  -- Lock row
  SELECT * INTO v_membership FROM public.memberships WHERE id = p_membership_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership % not found.', p_membership_id;
  END IF;

  v_previous_status := v_membership.status::text;

  -- Idempotency: same status = no-op, no audit
  IF v_previous_status = p_new_status THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'membership_id', p_membership_id,
      'current_status', v_previous_status
    );
  END IF;

  -- Hardcoded transition matrix
  v_allowed := CASE v_previous_status
    WHEN 'DRAFT'           THEN ARRAY['PENDING_PAYMENT', 'CANCELLED']
    WHEN 'PENDING_PAYMENT' THEN ARRAY['PENDING_REVIEW', 'CANCELLED']
    WHEN 'PENDING_REVIEW'  THEN ARRAY['APPROVED', 'REJECTED', 'CANCELLED', 'PENDING_PAYMENT']
    WHEN 'APPROVED'        THEN ARRAY['EXPIRED', 'CANCELLED']
    WHEN 'CANCELLED'       THEN ARRAY['DRAFT', 'PENDING_PAYMENT']
    WHEN 'REJECTED'        THEN ARRAY['DRAFT', 'PENDING_PAYMENT']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Invalid transition: % -> % for membership %.', v_previous_status, p_new_status, p_membership_id;
  END IF;

  -- Preconditions
  IF p_new_status = 'APPROVED' THEN
    IF v_membership.payment_status::text != 'PAID' THEN
      RAISE EXCEPTION 'Cannot approve membership %: payment_status must be PAID (is %).', p_membership_id, v_membership.payment_status;
    END IF;
    IF v_membership.athlete_id IS NULL THEN
      RAISE EXCEPTION 'Cannot approve membership %: athlete_id is NULL.', p_membership_id;
    END IF;
    IF COALESCE(p_actor_profile_id, v_membership.reviewed_by_profile_id) IS NULL THEN
      RAISE EXCEPTION 'Cannot approve membership %: reviewer profile_id required.', p_membership_id;
    END IF;
  END IF;

  IF p_new_status = 'REJECTED' AND COALESCE(p_reason, '') = '' THEN
    RAISE EXCEPTION 'Cannot reject membership %: reason is required.', p_membership_id;
  END IF;

  IF p_new_status = 'CANCELLED' AND COALESCE(p_reason, '') = '' THEN
    RAISE EXCEPTION 'Cannot cancel membership %: reason is required.', p_membership_id;
  END IF;

  IF p_new_status = 'EXPIRED' AND v_membership.end_date IS NULL THEN
    RAISE EXCEPTION 'Cannot expire membership %: end_date is NULL.', p_membership_id;
  END IF;

  -- Update membership with deterministic field assignments
  UPDATE public.memberships SET
    status = p_new_status::membership_status,
    -- APPROVED fields
    reviewed_at = CASE WHEN p_new_status = 'APPROVED' THEN now() ELSE v_membership.reviewed_at END,
    reviewed_by_profile_id = CASE WHEN p_new_status = 'APPROVED' THEN COALESCE(p_actor_profile_id, v_membership.reviewed_by_profile_id) ELSE v_membership.reviewed_by_profile_id END,
    review_notes = CASE WHEN p_new_status = 'APPROVED' THEN COALESCE(p_notes, v_membership.review_notes) ELSE v_membership.review_notes END,
    -- REJECTED fields
    rejected_at = CASE WHEN p_new_status = 'REJECTED' THEN now() ELSE v_membership.rejected_at END,
    rejected_by_profile_id = CASE WHEN p_new_status = 'REJECTED' THEN p_actor_profile_id ELSE v_membership.rejected_by_profile_id END,
    rejection_reason = CASE WHEN p_new_status = 'REJECTED' THEN p_reason ELSE v_membership.rejection_reason END,
    -- CANCELLED fields
    cancelled_at = CASE
      WHEN p_new_status = 'CANCELLED' THEN now()
      WHEN p_new_status = 'DRAFT' AND v_previous_status = 'CANCELLED' THEN NULL
      ELSE v_membership.cancelled_at
    END,
    cancelled_by_profile_id = CASE
      WHEN p_new_status = 'CANCELLED' THEN p_actor_profile_id
      WHEN p_new_status = 'DRAFT' AND v_previous_status = 'CANCELLED' THEN NULL
      ELSE v_membership.cancelled_by_profile_id
    END,
    cancellation_reason = CASE
      WHEN p_new_status = 'CANCELLED' THEN p_reason
      WHEN p_new_status = 'DRAFT' AND v_previous_status = 'CANCELLED' THEN NULL
      ELSE v_membership.cancellation_reason
    END,
    updated_at = now()
  WHERE id = p_membership_id;

  -- Audit log (mandatory)
  INSERT INTO public.audit_logs (
    event_type,
    tenant_id,
    profile_id,
    category,
    metadata
  ) VALUES (
    'MEMBERSHIP_STATE_CHANGED',
    v_membership.tenant_id,
    p_actor_profile_id,
    'GOVERNANCE',
    jsonb_build_object(
      'membership_id', p_membership_id,
      'previous_status', v_previous_status,
      'new_status', p_new_status,
      'reason', p_reason,
      'notes', p_notes,
      'pi_reference', 'MEMBERSHIP-GOV-001A',
      'occurred_at', now()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'membership_id', p_membership_id,
    'previous_status', v_previous_status,
    'new_status', p_new_status
  );
END;
$$;

-- ============================================================
-- STEP 5: PAYMENT GATEKEEPER — set_membership_payment_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_membership_payment_status(
  p_membership_id uuid,
  p_payment_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_membership RECORD;
  v_previous_payment_status text;
BEGIN
  -- Lock row
  SELECT * INTO v_membership FROM public.memberships WHERE id = p_membership_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership % not found.', p_membership_id;
  END IF;

  v_previous_payment_status := v_membership.payment_status::text;

  -- Idempotency
  IF v_previous_payment_status = p_payment_status THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'membership_id', p_membership_id,
      'current_payment_status', v_previous_payment_status
    );
  END IF;

  -- Validate against real enum values
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_status' AND e.enumlabel = p_payment_status
  ) THEN
    RAISE EXCEPTION 'Invalid payment_status value: %', p_payment_status;
  END IF;

  -- Update
  UPDATE public.memberships
  SET
    payment_status = p_payment_status::payment_status,
    updated_at = now()
  WHERE id = p_membership_id;

  -- Audit
  INSERT INTO public.audit_logs (
    event_type,
    tenant_id,
    profile_id,
    category,
    metadata
  ) VALUES (
    'MEMBERSHIP_PAYMENT_STATUS_CHANGED',
    v_membership.tenant_id,
    NULL,
    'GOVERNANCE',
    jsonb_build_object(
      'membership_id', p_membership_id,
      'previous_payment_status', v_previous_payment_status,
      'new_payment_status', p_payment_status,
      'reason', p_reason,
      'pi_reference', 'MEMBERSHIP-GOV-001A',
      'occurred_at', now()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'membership_id', p_membership_id,
    'previous_payment_status', v_previous_payment_status,
    'new_payment_status', p_payment_status
  );
END;
$$;

-- ============================================================
-- STEP 6: PRIVILEGES — Restrict EXECUTE to service_role only
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.change_membership_state(uuid, text, text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_membership_state(uuid, text, text, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_membership_payment_status(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_membership_payment_status(uuid, text, text) TO service_role;
