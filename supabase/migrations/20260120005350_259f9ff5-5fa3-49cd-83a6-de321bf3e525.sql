-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Public can verify membership by ID" ON public.memberships;

-- Drop the existing policies that reference each other and cause recursion
DROP POLICY IF EXISTS "Public can view membership via digital card" ON public.memberships;
DROP POLICY IF EXISTS "Public can view athlete via digital card verification" ON public.athletes;

-- Create a simpler approach: Create views for public verification
-- that expose only the necessary data without complex RLS

-- Create a public view for membership verification
CREATE OR REPLACE VIEW public.membership_verification
WITH (security_invoker = off) AS
SELECT 
  m.id as membership_id,
  m.status,
  m.start_date,
  m.end_date,
  m.payment_status,
  m.type,
  m.athlete_id,
  m.tenant_id,
  m.academy_id,
  m.preferred_coach_id,
  a.full_name as athlete_name,
  t.name as tenant_name,
  t.slug as tenant_slug,
  t.sport_types,
  dc.id as digital_card_id,
  dc.pdf_url,
  dc.valid_until as card_valid_until,
  dc.content_hash_sha256,
  dc.created_at as card_created_at
FROM memberships m
JOIN tenants t ON t.id = m.tenant_id AND t.is_active = true
LEFT JOIN athletes a ON a.id = m.athlete_id
LEFT JOIN digital_cards dc ON dc.membership_id = m.id;

-- Grant SELECT on this view to public/anon
GRANT SELECT ON public.membership_verification TO anon;
GRANT SELECT ON public.membership_verification TO authenticated;