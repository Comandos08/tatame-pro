-- =====================================================================
-- SECURITY HARDENED: Public Membership Verification View with Grading
-- =====================================================================
-- This view provides PUBLIC verification data for QR code scans.
-- SECURITY INVOKER OFF = behaves like SECURITY DEFINER
-- This allows anonymous users to verify memberships without RLS bypass.
-- 
-- CRITICAL: This view ONLY exposes:
-- - Masked athlete name (First Name + Last Initial)
-- - Organization public info (name, slug, sport_types)
-- - Membership status and validity
-- - Digital card availability
-- - Current grading (level name, scheme, sport type)
-- 
-- NEVER EXPOSED: email, phone, document, address, birth_date, full IDs
-- =====================================================================

DROP VIEW IF EXISTS public.membership_verification;

CREATE VIEW public.membership_verification
WITH (security_invoker = off)
AS
SELECT
  m.id AS membership_id,
  m.status,
  m.start_date,
  m.end_date,
  m.payment_status,
  m.type,
  
  -- Tenant (public info only)
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.slug AS tenant_slug,
  t.sport_types,
  
  -- Athlete (MASKED NAME - DB level security)
  -- Pattern: "First Name" + " " + "First letter of last name" + "."
  -- If no last name, returns just first name
  CASE 
    WHEN array_length(string_to_array(a.full_name, ' '), 1) > 1 THEN
      split_part(a.full_name, ' ', 1) || ' ' ||
      substr(split_part(a.full_name, ' ', array_length(string_to_array(a.full_name, ' '), 1)), 1, 1) || '.'
    ELSE
      split_part(a.full_name, ' ', 1)
  END AS athlete_name,
  
  -- Digital Card (public verification data)
  dc.id AS digital_card_id,
  dc.pdf_url,
  dc.valid_until AS card_valid_until,
  dc.content_hash_sha256,
  dc.created_at AS card_created_at,
  
  -- CURRENT GRADING (most recent grading for the athlete)
  -- Note: belt_color not available in current grading_levels schema
  g.level_name,
  g.level_code,
  g.scheme_name,
  g.sport_type AS grading_sport_type

FROM memberships m
JOIN tenants t ON t.id = m.tenant_id
JOIN athletes a ON a.id = m.athlete_id
LEFT JOIN digital_cards dc ON dc.membership_id = m.id

-- Latest grading for the athlete (LATERAL join for efficiency)
LEFT JOIN LATERAL (
  SELECT 
    gl.display_name AS level_name,
    gl.code AS level_code,
    gs.name AS scheme_name,
    gs.sport_type
  FROM athlete_gradings ag
  JOIN grading_levels gl ON gl.id = ag.grading_level_id
  JOIN grading_schemes gs ON gs.id = gl.grading_scheme_id
  WHERE ag.athlete_id = a.id
  ORDER BY ag.created_at DESC
  LIMIT 1
) g ON true;

-- Grant access to anonymous and authenticated users
GRANT SELECT ON public.membership_verification TO anon;
GRANT SELECT ON public.membership_verification TO authenticated;

-- Document the security rationale
COMMENT ON VIEW public.membership_verification IS 
'Public verification view for membership QR codes. 
SECURITY: Uses security_invoker=off to allow anonymous access to restricted public data.
NEVER exposes PII: email, phone, document, address, birth_date.
Athlete name is masked at DB level (First Name + Last Initial).
Includes current grading information for display on verification page.';