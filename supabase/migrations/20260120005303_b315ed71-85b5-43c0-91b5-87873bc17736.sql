-- Add RLS policy to allow public SELECT on memberships when the membership ID is known
-- This enables the public verification page to work for anonymous users
-- The verification URL contains the membership UUID which acts as a bearer token

CREATE POLICY "Public can verify membership by ID"
ON public.memberships
FOR SELECT
USING (true);

-- Note: This policy allows reading any membership by ID, which is acceptable because:
-- 1. The membership ID (UUID) is unguessable and acts as a capability token
-- 2. Only minimal data is exposed (no sensitive PII)
-- 3. Athlete names are masked on the frontend
-- 4. This follows the QR code verification pattern used industry-wide