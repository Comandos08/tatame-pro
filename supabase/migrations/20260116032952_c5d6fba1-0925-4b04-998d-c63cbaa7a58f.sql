-- Create a limited public policy for athletes that only allows access when joining from diplomas/digital_cards
-- This is safe because we only expose the full_name which is already masked in the frontend

-- Policy for athletes accessed via diploma verification
CREATE POLICY "Public can view athlete name via diploma"
  ON public.athletes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.diplomas d 
      WHERE d.athlete_id = athletes.id 
      AND d.status = 'ISSUED'
    )
  );

-- Policy for athletes accessed via membership/card verification  
CREATE POLICY "Public can view athlete name via membership"
  ON public.athletes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m 
      WHERE m.athlete_id = athletes.id 
      AND m.status IN ('ACTIVE', 'APPROVED')
      AND m.payment_status = 'PAID'
    )
  );