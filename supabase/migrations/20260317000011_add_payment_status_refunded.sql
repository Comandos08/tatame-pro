-- =============================================================================
-- P0-02: Add REFUNDED to payment_status enum
-- =============================================================================
-- Required for handling charge.refunded Stripe webhook events.
-- The set_membership_payment_status gatekeeper validates against pg enum,
-- so the value must exist before the edge function can use it.
-- =============================================================================

ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'REFUNDED';

-- Update governance view to detect inconsistency:
-- membership APPROVED with payment_status REFUNDED is an anomaly
-- (the state machine should have already cancelled it)
COMMENT ON TYPE public.payment_status IS
  'Membership payment lifecycle: NOT_PAID → PAID | FAILED | WAIVED | REFUNDED';
