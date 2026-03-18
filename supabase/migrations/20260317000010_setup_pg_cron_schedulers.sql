-- =============================================================================
-- P0-01: SETUP CRON JOBS via pg_cron + pg_net
-- =============================================================================
-- All 10 scheduler edge functions exist and are functional, but they were
-- never being called automatically. This migration wires them to pg_cron.
--
-- PREREQUISITE (run once in Supabase Dashboard → SQL Editor):
--   SELECT vault.create_secret('your-actual-cron-secret', 'cron_secret',
--     'Secret for authenticating cron job HTTP calls');
--
-- The functions read CRON_SECRET from Supabase Function Secrets (env var).
-- The vault secret here must match that value.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================================================
-- HELPER: One PL/pgSQL wrapper per job.
-- Reading from vault at runtime (not migration time) keeps secrets out of
-- migration files and allows secret rotation without re-deploying.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS cron_jobs;

-- Generic dispatcher: reads vault secret and calls edge function via HTTP
CREATE OR REPLACE FUNCTION cron_jobs.call_edge_function(p_function_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secret  text;
  v_url     text;
BEGIN
  -- Read CRON_SECRET from vault at runtime (never hardcoded)
  SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'cron_secret'
   LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING '[cron_jobs] vault secret "cron_secret" not found. Skipping %.', p_function_name;
    RETURN;
  END IF;

  v_url := 'https://kotxhtveuegrywzyvdnl.supabase.co/functions/v1/' || p_function_name;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Individual wrappers (pg_cron needs a simple SELECT statement to schedule)
CREATE OR REPLACE FUNCTION cron_jobs.run_expire_trials()              RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('expire-trials'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_expire_grace_period()        RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('expire-grace-period'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_cleanup_expired_tenants()    RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('cleanup-expired-tenants'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_expire_memberships()         RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('expire-memberships'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_pre_expiration_scheduler()   RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('pre-expiration-scheduler'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_check_trial_ending()         RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('check-trial-ending'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_cleanup_abandoned()          RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('cleanup-abandoned-memberships'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_cleanup_pending_payment()    RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('cleanup-pending-payment-memberships'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_cleanup_tmp_documents()      RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('cleanup-tmp-documents'); $$;
CREATE OR REPLACE FUNCTION cron_jobs.run_check_membership_renewal()   RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT cron_jobs.call_edge_function('check-membership-renewal'); $$;

-- =============================================================================
-- SCHEDULE ALL JOBS
-- Times are UTC. Staggered to avoid DB lock contention.
-- =============================================================================

-- Remove existing schedules (idempotent re-run)
SELECT cron.unschedule(jobname)
  FROM cron.job
 WHERE jobname IN (
   'tatame/expire-trials',
   'tatame/expire-grace-period',
   'tatame/cleanup-expired-tenants',
   'tatame/expire-memberships',
   'tatame/pre-expiration-scheduler',
   'tatame/check-trial-ending',
   'tatame/cleanup-abandoned-memberships',
   'tatame/cleanup-pending-payment-memberships',
   'tatame/cleanup-tmp-documents',
   'tatame/check-membership-renewal'
 );

-- 00:05 UTC — expire-trials (TRIALING → TRIAL_EXPIRED, starts 8-day grace period)
SELECT cron.schedule('tatame/expire-trials',             '5 0 * * *',  'SELECT cron_jobs.run_expire_trials()');

-- 00:10 UTC — expire-grace-period (TRIAL_EXPIRED + grace over → SUSPENDED)
SELECT cron.schedule('tatame/expire-grace-period',       '10 0 * * *', 'SELECT cron_jobs.run_expire_grace_period()');

-- 00:15 UTC — cleanup-expired-tenants (SUSPENDED past retention → TERMINATED)
SELECT cron.schedule('tatame/cleanup-expired-tenants',   '15 0 * * *', 'SELECT cron_jobs.run_cleanup_expired_tenants()');

-- 02:30 UTC — pre-expiration-scheduler (sends reminders at 1/3/7/15/30 days before expiry)
SELECT cron.schedule('tatame/pre-expiration-scheduler',  '30 2 * * *', 'SELECT cron_jobs.run_pre_expiration_scheduler()');

-- 03:00 UTC — expire-memberships (APPROVED past end_date → EXPIRED)
SELECT cron.schedule('tatame/expire-memberships',        '0 3 * * *',  'SELECT cron_jobs.run_expire_memberships()');

-- 04:00 UTC — cleanup-abandoned-memberships (DRAFT/PENDING stale > threshold)
SELECT cron.schedule('tatame/cleanup-abandoned-memberships', '0 4 * * *', 'SELECT cron_jobs.run_cleanup_abandoned()');

-- 04:30 UTC — cleanup-pending-payment-memberships (PENDING_PAYMENT stale > threshold)
SELECT cron.schedule('tatame/cleanup-pending-payment-memberships', '30 4 * * *', 'SELECT cron_jobs.run_cleanup_pending_payment()');

-- 05:00 UTC — cleanup-tmp-documents (remove expired temp doc tokens)
SELECT cron.schedule('tatame/cleanup-tmp-documents',     '0 5 * * *',  'SELECT cron_jobs.run_cleanup_tmp_documents()');

-- 09:00 UTC — check-membership-renewal (notify admins of upcoming renewals)
SELECT cron.schedule('tatame/check-membership-renewal',  '0 9 * * *',  'SELECT cron_jobs.run_check_membership_renewal()');

-- 10:00 UTC — check-trial-ending (TRIALING ending in ~3 days → send warning email)
SELECT cron.schedule('tatame/check-trial-ending',        '0 10 * * *', 'SELECT cron_jobs.run_check_trial_ending()');

-- Restrict execution to service_role only
REVOKE ALL ON SCHEMA cron_jobs FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA cron_jobs TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA cron_jobs FROM public, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cron_jobs TO service_role;
