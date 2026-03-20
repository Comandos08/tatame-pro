-- =============================================================================
-- DEV-ONLY MIGRATION — NEUTRALIZED (P3-FIX 1.4)
-- =============================================================================
-- This file originally contained a full database wipe used to reset a
-- development environment (DELETE FROM auth.users, DELETE FROM public.*).
--
-- It has been intentionally neutralized to prevent accidental data destruction
-- if this migration sequence is ever replayed on a production or staging DB.
--
-- Original intent: keep only global@tatame.pro and wipe all other data/users.
-- This is a destructive dev-only operation and must never run in production.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE
    'SKIPPED: 20260226000528 is a neutralized dev-only data-wipe migration. '
    'No data was modified. If you need to reset a dev DB, use `supabase db reset` '
    'on a local/dev project only.';
END $$;
