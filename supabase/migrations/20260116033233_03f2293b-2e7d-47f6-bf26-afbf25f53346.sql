-- Drop problematic recursive policies
DROP POLICY IF EXISTS "Public can view athlete name via diploma" ON public.athletes;
DROP POLICY IF EXISTS "Public can view athlete name via membership" ON public.athletes;
DROP POLICY IF EXISTS "Public can view membership via card verification" ON public.memberships;
DROP POLICY IF EXISTS "Public can verify digital cards" ON public.digital_cards;
DROP POLICY IF EXISTS "Public can verify issued diplomas" ON public.diplomas;
DROP POLICY IF EXISTS "Public can view coach via diploma verification" ON public.coaches;

-- Create security definer functions to avoid recursion

-- Function to check if athlete has an issued diploma
CREATE OR REPLACE FUNCTION public.athlete_has_issued_diploma(_athlete_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diplomas
    WHERE athlete_id = _athlete_id
      AND status = 'ISSUED'
  )
$$;

-- Function to check if athlete has active paid membership
CREATE OR REPLACE FUNCTION public.athlete_has_active_membership(_athlete_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE athlete_id = _athlete_id
      AND status IN ('ACTIVE', 'APPROVED')
      AND payment_status = 'PAID'
  )
$$;

-- Function to check if membership has a digital card
CREATE OR REPLACE FUNCTION public.membership_has_digital_card(_membership_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.digital_cards
    WHERE membership_id = _membership_id
  )
$$;

-- Function to check if coach has issued diploma
CREATE OR REPLACE FUNCTION public.coach_has_issued_diploma(_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diplomas
    WHERE coach_id = _coach_id
      AND status = 'ISSUED'
  )
$$;

-- Now create safe policies using the security definer functions

-- Diploma verification - public can view ISSUED diplomas
CREATE POLICY "Public can verify issued diplomas"
  ON public.diplomas
  FOR SELECT
  USING (status = 'ISSUED');

-- Digital card verification - public can view all cards (used for verification)
CREATE POLICY "Public can verify digital cards"
  ON public.digital_cards
  FOR SELECT
  USING (true);

-- Athletes - public can view only athletes with issued diplomas or active memberships
CREATE POLICY "Public can view athlete for verification"
  ON public.athletes
  FOR SELECT
  USING (
    public.athlete_has_issued_diploma(id) 
    OR public.athlete_has_active_membership(id)
  );

-- Memberships - public can view memberships that have digital cards
CREATE POLICY "Public can view membership via card verification"
  ON public.memberships
  FOR SELECT
  USING (public.membership_has_digital_card(id));

-- Coaches - public can view coaches with issued diplomas
CREATE POLICY "Public can view coach via diploma verification"
  ON public.coaches
  FOR SELECT
  USING (public.coach_has_issued_diploma(id));