
-- ============================================================
-- PI-ATHLETE-BEFORE-MEMBERSHIP-001 v4 — BLOCO 1 / C0
-- DB Additive Prerequisites (idempotent)
-- ============================================================

-- 1) Create athlete_status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'athlete_status') THEN
    CREATE TYPE athlete_status AS ENUM ('ASPIRANTE', 'ATIVO', 'SUSPENSO', 'INATIVO');
  END IF;
END $$;

-- 2) Add athletes.status column if not exists
ALTER TABLE public.athletes
  ADD COLUMN IF NOT EXISTS status athlete_status NOT NULL DEFAULT 'ASPIRANTE';

-- 3) Add WAIVED to payment_status enum (idempotent)
-- NOTE: ALTER TYPE ADD VALUE is idempotent in Postgres 14+ with IF NOT EXISTS
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'WAIVED';

-- 4) Add waived_reason and waived_by_profile_id columns to memberships
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS waived_reason TEXT;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS waived_by_profile_id UUID REFERENCES public.profiles(id);

-- 5) Update gatekeeper set_membership_payment_status to handle WAIVED
CREATE OR REPLACE FUNCTION public.set_membership_payment_status(
  p_membership_id UUID,
  p_payment_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership RECORD;
  v_previous_payment_status text;
  v_actor_id UUID;
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

  -- WAIVED requires reason
  IF p_payment_status = 'WAIVED' AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RAISE EXCEPTION 'WAIVED payment_status requires a non-empty reason (p_reason).';
  END IF;

  -- Get actor (caller)
  v_actor_id := auth.uid();

  -- Update membership
  UPDATE public.memberships
  SET
    payment_status = p_payment_status::payment_status,
    waived_reason = CASE WHEN p_payment_status = 'WAIVED' THEN p_reason ELSE NULL END,
    waived_by_profile_id = CASE WHEN p_payment_status = 'WAIVED' THEN v_actor_id ELSE NULL END,
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
    v_actor_id,
    'GOVERNANCE',
    jsonb_build_object(
      'membership_id', p_membership_id,
      'previous_payment_status', v_previous_payment_status,
      'new_payment_status', p_payment_status,
      'reason', p_reason,
      'waived_by', v_actor_id,
      'pi_reference', 'PI-ATHLETE-BEFORE-MEMBERSHIP-001-v4',
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
