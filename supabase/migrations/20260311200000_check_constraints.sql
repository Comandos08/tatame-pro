-- Phase 1/4: CHECK constraints for data integrity (P2-48)
-- Additive only — no destructive operations

-- Athletes: birth_date must not be in the future
ALTER TABLE public.athletes
  ADD CONSTRAINT chk_athletes_birth_date_not_future
  CHECK (birth_date <= CURRENT_DATE);

-- Memberships: end_date must be after start_date (when both are set)
ALTER TABLE public.memberships
  ADD CONSTRAINT chk_memberships_end_after_start
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

-- Digital cards: valid_until must be after created_at
ALTER TABLE public.digital_cards
  ADD CONSTRAINT chk_digital_cards_valid_until
  CHECK (valid_until IS NULL OR valid_until >= created_at::date);
