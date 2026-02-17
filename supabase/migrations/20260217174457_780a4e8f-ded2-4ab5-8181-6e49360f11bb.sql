-- ================================================================
-- PI-INSTITUTIONAL-TENANT-LIFECYCLE-GOV-001
-- Step 2: Privilege Lockdown (Column-Level)
-- EXECUTE AFTER complete-tenant-onboarding is deployed with RPC
-- ================================================================

-- 1. REVOKE all UPDATE at table level
REVOKE UPDATE ON public.tenants FROM anon;
REVOKE UPDATE ON public.tenants FROM authenticated;
REVOKE UPDATE ON public.tenants FROM service_role;

-- 2. GRANT UPDATE on NON-lifecycle columns to service_role
GRANT UPDATE(
  slug, name, logo_url, primary_color, sport_types,
  stripe_customer_id, is_active, updated_at, default_locale,
  description, billing_email, card_template_url, diploma_template_url,
  creation_source
) ON public.tenants TO service_role;

-- 3. GRANT UPDATE on NON-lifecycle columns to authenticated (for RLS-based admin updates)
GRANT UPDATE(
  slug, name, logo_url, primary_color, sport_types,
  updated_at, default_locale, description, billing_email,
  card_template_url, diploma_template_url
) ON public.tenants TO authenticated;

-- Protected columns (ONLY writable via SECURITY DEFINER gatekeeper):
-- lifecycle_status
-- status
-- onboarding_completed
-- onboarding_completed_at
-- onboarding_completed_by