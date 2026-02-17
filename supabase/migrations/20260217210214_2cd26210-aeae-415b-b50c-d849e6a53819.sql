-- PI-MEMBERSHIP-GOV-001B Wave 2B: Column-Level Privilege Lockdown
-- REVOKE table-level UPDATE from service_role
REVOKE UPDATE ON public.memberships FROM service_role;

-- GRANT UPDATE only on non-lifecycle columns
GRANT UPDATE (
  tenant_id, athlete_id, academy_id, preferred_coach_id,
  start_date, end_date, price_cents, currency,
  stripe_checkout_session_id, stripe_payment_intent_id,
  applicant_data, applicant_profile_id, documents_uploaded,
  webhook_processed_at, renewal_reminder_sent,
  updated_at, type
) ON public.memberships TO service_role;

-- Protected columns (only via RPC):
-- status
-- payment_status
-- reviewed_at, reviewed_by_profile_id, review_notes
-- rejected_at, rejected_by_profile_id, rejection_reason
-- cancelled_at, cancelled_by_profile_id, cancellation_reason