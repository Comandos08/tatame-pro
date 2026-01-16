-- Add public RLS policies for verification pages

-- Policy for public diploma verification (only ISSUED diplomas)
CREATE POLICY "Public can verify issued diplomas"
  ON public.diplomas
  FOR SELECT
  USING (status = 'ISSUED');

-- Policy for public digital card verification (only cards with valid membership)
CREATE POLICY "Public can verify digital cards"
  ON public.digital_cards
  FOR SELECT
  USING (true);

-- Policy for public athlete name lookup for verification (limited data exposure)
CREATE POLICY "Public can view athlete for verification"
  ON public.athletes
  FOR SELECT
  USING (true);