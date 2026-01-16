-- Drop the overly permissive athlete policy
DROP POLICY IF EXISTS "Public can view athlete for verification" ON public.athletes;

-- Create a secure view for public verification that only exposes minimal data
CREATE OR REPLACE VIEW public.athletes_public_verification
WITH (security_invoker = on) AS
SELECT 
  id,
  full_name,
  tenant_id
FROM public.athletes;

-- Grant access to the view for anon role
GRANT SELECT ON public.athletes_public_verification TO anon;
GRANT SELECT ON public.athletes_public_verification TO authenticated;