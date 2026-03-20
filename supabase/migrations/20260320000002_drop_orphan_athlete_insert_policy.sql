-- Migration: Drop orphaned "Public can insert athlete for membership" (singular) policy
--
-- Root cause: Migration 20260116133448 created policy
-- "Public can insert athlete for membership" (singular) on public.athletes
-- with WITH CHECK (true) — no tenant validation whatsoever.
--
-- Subsequent tighten migrations (20260316000001, 20260319000003) only targeted
-- the plural variant "Public can insert athletes for membership" and never
-- dropped the singular one. As a result, both policies remained active
-- simultaneously. Because INSERT RLS policies are OR-evaluated, the wide-open
-- singular policy bypassed the tightened plural policy entirely, allowing
-- unauthenticated clients to insert athlete rows referencing arbitrary tenant_ids.
--
-- Fix: Drop the orphaned wide-open policy. The tightened plural policy
-- "Public can insert athletes for membership" (from 20260319000003) already
-- enforces the correct WITH CHECK (tenant must not be TERMINATED).

DROP POLICY IF EXISTS "Public can insert athlete for membership" ON public.athletes;
