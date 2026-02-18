
-- FASE D: Conditional validation trigger (Ajuste 2)
CREATE OR REPLACE FUNCTION public.validate_approved_membership()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND
     (TG_OP = 'INSERT' OR OLD.status <> 'APPROVED') THEN

    IF NEW.athlete_id IS NULL THEN
      RAISE EXCEPTION 'APPROVED membership requires athlete_id';
    END IF;

    IF NEW.reviewed_by_profile_id IS NULL THEN
      RAISE EXCEPTION 'APPROVED membership requires reviewed_by_profile_id';
    END IF;

    IF NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'APPROVED membership requires reviewed_at';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';

-- Drop trigger if exists to avoid duplicate
DROP TRIGGER IF EXISTS enforce_approved_invariants ON public.memberships;

CREATE TRIGGER enforce_approved_invariants
BEFORE INSERT OR UPDATE ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.validate_approved_membership();
