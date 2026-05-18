-- =============================================================================
-- DEV-ONLY MIGRATION — NEUTRALIZED (P3-FIX 1.4)
-- =============================================================================
-- This file originally contained an unguarded destructive reset that, on any
-- populated database, would have wiped roles, auth users and profiles:
--
--   DELETE FROM public.user_roles;                        -- ALL roles
--   INSERT INTO public.user_roles (... SUPERADMIN_GLOBAL ...) for global@tatame.pro
--   UPDATE public.profiles SET tenant_id = NULL  (global profile)
--   DELETE FROM auth.users     WHERE email <> 'global@tatame.pro';
--   DELETE FROM public.profiles WHERE email <> 'global@tatame.pro';
--
-- It has been intentionally neutralized to prevent accidental data destruction
-- if this migration sequence is ever replayed on a production or staging DB,
-- or when provisioning a fresh environment from migrations.
--
-- The production database is unaffected: this migration version is already
-- recorded as applied and is matched by version, not by content. The
-- SUPERADMIN_GLOBAL bootstrap for global@tatame.pro is environment seed data
-- (handled by operational seeding), not a schema migration concern.
--
-- Original intent: collapse the environment down to only global@tatame.pro.
-- This is a destructive dev-only operation and must never run in production.
-- Consistent with the neutralization of sibling migration 20260226000528.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE
    'SKIPPED: 20260226002950 is a neutralized dev-only data-wipe migration. '
    'No data was modified. If you need to reset a dev DB, use `supabase db reset` '
    'on a local/dev project only.';
END $$;
