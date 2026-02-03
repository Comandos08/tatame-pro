-- P1: Remove public policy that exposes all digital_cards
-- This policy had qual: true, allowing anyone to list ALL cards
DROP POLICY IF EXISTS "Public can verify digital cards" ON public.digital_cards;