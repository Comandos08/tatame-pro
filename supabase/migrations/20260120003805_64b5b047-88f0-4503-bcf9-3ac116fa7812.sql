-- Fix: Allow public SELECT on athletes when verifying digital cards
-- This enables the verification page to show masked athlete name

CREATE POLICY "Public can view athlete via digital card verification"
ON public.athletes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.digital_cards dc
    JOIN public.memberships m ON m.id = dc.membership_id
    WHERE m.athlete_id = athletes.id
  )
);

-- Also need to allow public SELECT on memberships when there's a digital card
CREATE POLICY "Public can view membership via digital card"
ON public.memberships
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.digital_cards dc
    WHERE dc.membership_id = memberships.id
  )
);