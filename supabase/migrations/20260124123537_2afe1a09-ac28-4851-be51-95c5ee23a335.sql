-- Fix function without search_path
CREATE OR REPLACE FUNCTION public.prevent_event_results_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'event_results are immutable - UPDATE and DELETE are not allowed';
END;
$$;