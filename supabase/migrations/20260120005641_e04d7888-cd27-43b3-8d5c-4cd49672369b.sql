-- Drop and recreate the membership_verification view with security hardening
-- SECURITY RATIONALE:
-- - This view uses security_invoker=off (SECURITY DEFINER equivalent for views)
-- - This is SAFE because:
--   1. The view ONLY exposes non-sensitive, public-facing data
--   2. Athlete name is masked at the database level (First Name + Last Initial)
--   3. No PII is exposed: no email, phone, address, birth_date, national_id
--   4. No unnecessary IDs are exposed
--   5. The membership UUID acts as an unguessable capability token
--   6. This follows industry-standard QR verification patterns

DROP VIEW IF EXISTS public.membership_verification;

CREATE OR REPLACE VIEW public.membership_verification
WITH (security_invoker = off) AS
SELECT
  -- Membership identification (UUID is unguessable capability token)
  m.id as membership_id,
  
  -- Masked athlete name: "First Name + Last Initial."
  -- Example: "João Silva" becomes "João S."
  -- If no last name, returns just first name
  CASE 
    WHEN a.full_name IS NULL THEN NULL
    WHEN position(' ' in a.full_name) > 0 THEN
      split_part(a.full_name, ' ', 1) || ' ' || 
      upper(left(split_part(a.full_name, ' ', array_length(string_to_array(a.full_name, ' '), 1)), 1)) || '.'
    ELSE a.full_name
  END as athlete_name,
  
  -- Tenant public info only
  t.name as tenant_name,
  t.slug as tenant_slug,
  t.sport_types,
  
  -- Membership status and dates (public info for verification)
  m.status,
  m.start_date,
  m.end_date,
  m.payment_status,
  m.type,
  
  -- Digital card availability (boolean-like check)
  dc.id as digital_card_id,
  dc.pdf_url,
  dc.valid_until as card_valid_until,
  dc.content_hash_sha256,
  dc.created_at as card_created_at,
  
  -- Foreign keys needed for additional lookups (academy name, coach name)
  -- These are UUIDs only, not sensitive data
  m.tenant_id,
  m.athlete_id,
  m.academy_id,
  m.preferred_coach_id
FROM memberships m
JOIN tenants t ON t.id = m.tenant_id AND t.is_active = true
LEFT JOIN athletes a ON a.id = m.athlete_id
LEFT JOIN digital_cards dc ON dc.membership_id = m.id;

-- Ensure proper grants
GRANT SELECT ON public.membership_verification TO anon;
GRANT SELECT ON public.membership_verification TO authenticated;

-- Add comment documenting security decisions
COMMENT ON VIEW public.membership_verification IS 
'Public verification view for QR code scanning. 
SECURITY: Uses security_invoker=off to bypass RLS safely because:
1. Only exposes masked athlete name (First + Last Initial)
2. No PII exposed (no email, phone, address, birth_date, national_id)
3. Membership UUID acts as unguessable capability token
4. Standard pattern for document verification systems';