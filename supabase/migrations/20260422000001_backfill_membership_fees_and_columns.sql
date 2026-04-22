-- =============================================================================
-- BACKFILL: membership_fees table + memberships.fee_* columns
-- =============================================================================
-- Closes a schema drift: production already has these objects (created ad-hoc),
-- but no migration in the repo materialises them. Fresh environments built from
-- migrations-only were missing membership_fees entirely, breaking
-- src/pages/MembershipCheckout.tsx and the create-membership-fee-checkout edge
-- function.
--
-- This migration is intentionally idempotent (IF NOT EXISTS everywhere) so it
-- can be replayed against production without side effects, and it adds the
-- schema only — RLS policies in production were configured manually and are
-- NOT touched here to avoid overwriting them. New environments spun up from
-- migrations alone should follow the runbook in docs/HARDENING.md (or
-- equivalent) to add production-equivalent RLS before going live.
-- =============================================================================

-- ── memberships columns ─────────────────────────────────────────────────────
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS fee_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS fee_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.memberships.fee_amount_cents IS
  'Per-membership Stripe fee amount in cents. Set on membership creation.';
COMMENT ON COLUMN public.memberships.fee_paid_at IS
  'Set by stripe-webhook when the associated membership_fees row is paid. Non-lifecycle column.';

-- ── membership_fees table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.membership_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL UNIQUE REFERENCES public.memberships(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_fees_tenant_id ON public.membership_fees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_membership_fees_paid_at ON public.membership_fees(paid_at) WHERE paid_at IS NOT NULL;

COMMENT ON TABLE public.membership_fees IS
  'Stripe fee records keyed 1:1 to memberships. Inserted by create-membership-fee-checkout edge function; paid_at is set by stripe-webhook.';

-- ── RLS: enable but do not create policies ──────────────────────────────────
-- Production already has policies configured. Enabling RLS with no policies
-- is fail-closed (authenticated reads/writes are denied; service_role bypasses
-- via BYPASSRLS). This matches production's invariant where the edge function
-- uses service_role and front-end reads rely on existing SELECT policies.
ALTER TABLE public.membership_fees ENABLE ROW LEVEL SECURITY;
