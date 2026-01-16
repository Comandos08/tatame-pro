-- Add public SELECT policy for memberships accessed via digital card verification
CREATE POLICY "Public can view membership via card verification"
  ON public.memberships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.digital_cards dc 
      WHERE dc.membership_id = memberships.id
    )
  );

-- Add public SELECT policy for coaches when linked to diplomas
CREATE POLICY "Public can view coach via diploma verification"
  ON public.coaches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.diplomas d 
      WHERE d.coach_id = coaches.id 
      AND d.status = 'ISSUED'
    )
  );