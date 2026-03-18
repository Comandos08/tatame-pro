-- =============================================================================
-- PERFORMANCE: Missing critical indexes
-- =============================================================================
-- Identified by: production audit + stripe-webhook query analysis
--
-- Critical:
--   stripe_payment_intent_id — used in 5 lookups in stripe-webhook (charge.refunded,
--   handlePaymentSucceeded, handlePaymentFailed, handleDisputeCreated, handleDisputeClosed).
--   Without this index every refund/dispute event does a full table scan on memberships.
--
-- Important:
--   memberships(athlete_id) — used in membership history queries
--   memberships(tenant_id, athlete_id) — composite for tenant-scoped athlete queries
--   documents(tenant_id, athlete_id) — LGPD export, document listing
--   digital_cards(tenant_id) — card listing by tenant
--   diplomas(tenant_id, athlete_id) — diploma listing in athlete profile
--   memberships(applicant_profile_id) — applicant lookup during onboarding flow
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- CRITICAL: stripe_payment_intent_id lookup (charge.refunded, dispute handlers)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_memberships_stripe_payment_intent
  ON public.memberships(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Membership queries by athlete
-- ────────────────────────────────────────────────────────────────────────────

-- Athlete's full membership history (all tenants)
CREATE INDEX IF NOT EXISTS idx_memberships_athlete_id
  ON public.memberships(athlete_id)
  WHERE athlete_id IS NOT NULL;

-- Tenant-scoped athlete membership (most common join pattern)
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_athlete
  ON public.memberships(tenant_id, athlete_id)
  WHERE athlete_id IS NOT NULL;

-- Applicant lookup (pre-athlete approval flow)
CREATE INDEX IF NOT EXISTS idx_memberships_applicant_profile
  ON public.memberships(applicant_profile_id)
  WHERE applicant_profile_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Documents: LGPD export + athlete document listing
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_tenant_athlete
  ON public.documents(tenant_id, athlete_id);

CREATE INDEX IF NOT EXISTS idx_documents_athlete_id
  ON public.documents(athlete_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Digital cards: listing by tenant (admin dashboard)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_digital_cards_tenant_id
  ON public.digital_cards(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Diplomas: athlete profile + verification
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_diplomas_tenant_athlete
  ON public.diplomas(tenant_id, athlete_id)
  WHERE athlete_id IS NOT NULL;
