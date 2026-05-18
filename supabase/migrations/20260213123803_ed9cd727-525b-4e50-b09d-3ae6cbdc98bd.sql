-- =============================================================================
-- DEV-ONLY MIGRATION — NEUTRALIZED (P3-FIX 1.4)
-- =============================================================================
-- This file originally contained an unguarded destructive statement used to
-- reset a development environment:
--
--   DELETE FROM auth.users WHERE email != 'global@tatame.pro';
--
-- It has been intentionally neutralized to prevent accidental data destruction
-- if this migration sequence is ever replayed on a production or staging DB,
-- or when provisioning a fresh environment from migrations.
--
-- The production database is unaffected: this migration version is already
-- recorded as applied and is matched by version, not by content.
--
-- Original intent: keep only global@tatame.pro and wipe all other auth users.
-- This is a destructive dev-only operation and must never run in production.
-- Consistent with the neutralization of sibling migration 20260226000528.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE
    'SKIPPED: 20260213123803 is a neutralized dev-only data-wipe migration. '
    'No data was modified. If you need to reset a dev DB, use `supabase db reset` '
    'on a local/dev project only.';
END $$;
