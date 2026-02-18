
-- FASE C: Gatekeeper hardening - ADMIN_ACTIVE terminal fail-fast
CREATE OR REPLACE FUNCTION public.change_membership_state(p_membership_id uuid, p_new_status text, p_reason text, p_actor_profile_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHEN 'ADMIN_ACTIVE'    THEN NULL  -- sentinel for terminal check below
    ELSE ARRAY[]::text[]
  END;

  -- AJUSTE 1: Fail-fast for ADMIN_ACTIVE (terminal, immutable)
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'ADMIN_ACTIVE is terminal and immutable. No transitions allowed for membership %.', p_membership_id;
  END IF;

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
    reviewed_at = CASE WHEN p_new_status = 'APPROVED' THEN now() ELSE v_membership.reviewed_at END,
    reviewed_by_profile_id = CASE WHEN p_new_status = 'APPROVED' THEN COALESCE(p_actor_profile_id, v_membership.reviewed_by_profile_id) ELSE v_membership.reviewed_by_profile_id END,
    review_notes = CASE WHEN p_new_status = 'APPROVED' THEN COALESCE(p_notes, v_membership.review_notes) ELSE v_membership.review_notes END,
    rejected_at = CASE WHEN p_new_status = 'REJECTED' THEN now() ELSE v_membership.rejected_at END,
    rejected_by_profile_id = CASE WHEN p_new_status = 'REJECTED' THEN p_actor_profile_id ELSE v_membership.rejected_by_profile_id END,
    rejection_reason = CASE WHEN p_new_status = 'REJECTED' THEN p_reason ELSE v_membership.rejection_reason END,
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
    event_type, tenant_id, profile_id, category, metadata
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
$function$;
