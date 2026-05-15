-- =============================================================================
-- STRIPE CONNECT — Marketplace payouts (Express accounts, destination charges)
-- =============================================================================
-- Tatame Pro is a marketplace: athletes pay membership/event fees that belong
-- to the Tenant (organization), not to the platform. Before this migration the
-- B2C checkouts (create-membership-checkout, create-event-registration-checkout)
-- collected funds into the single platform Stripe account with no payout path
-- to the Tenant.
--
-- This adds the per-Tenant Stripe Connect (Express) account linkage and the
-- platform-fee configuration. The platform takes `platform_fee_bps` basis
-- points of each charge as an application fee; Stripe transfers the remainder
-- to the Tenant's connected account automatically (destination charge).
--
-- Idempotent (IF NOT EXISTS) so it can be replayed against production safely.
-- RLS is NOT modified here: the `tenants` table already has RLS and tenant
-- admins can read their own row; these columns are written only by edge
-- functions using the service role.
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 500;

-- Platform fee is basis points: 500 = 5.00%. Bounded 0..10000 (0%..100%).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_platform_fee_bps_range'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_platform_fee_bps_range
      CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 10000);
  END IF;
END $$;

-- One connected account per Tenant (Stripe account ids are globally unique).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_connect_account_id
  ON public.tenants (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.stripe_connect_account_id IS
  'Stripe Connect Express account id (acct_...). NULL until the tenant admin completes onboarding via connect-onboarding-start.';
COMMENT ON COLUMN public.tenants.stripe_connect_charges_enabled IS
  'Mirror of Stripe account.charges_enabled. Synced by connect-account-refresh / account.updated webhook. Destination charges require this true.';
COMMENT ON COLUMN public.tenants.stripe_connect_payouts_enabled IS
  'Mirror of Stripe account.payouts_enabled. Synced by connect-account-refresh / account.updated webhook.';
COMMENT ON COLUMN public.tenants.stripe_connect_details_submitted IS
  'Mirror of Stripe account.details_submitted (KYC form completed). Synced by connect-account-refresh / account.updated webhook.';
COMMENT ON COLUMN public.tenants.stripe_connect_updated_at IS
  'Last time the Connect status columns were synced from Stripe.';
COMMENT ON COLUMN public.tenants.platform_fee_bps IS
  'Platform application fee in basis points (500 = 5.00%). Default 500. Per-tenant override allowed (e.g. enterprise tier).';
