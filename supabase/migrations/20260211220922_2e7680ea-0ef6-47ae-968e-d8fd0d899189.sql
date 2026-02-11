-- A02.T2: Anti-Concurrent Impersonation Lock
-- Enforce exactly 1 ACTIVE session per superadmin at the database level.
-- This prevents race conditions where two concurrent start-impersonation calls
-- both pass the UPDATE step and try to INSERT simultaneously.

CREATE UNIQUE INDEX IF NOT EXISTS superadmin_impersonations_one_active_per_superadmin
ON public.superadmin_impersonations (superadmin_user_id)
WHERE status = 'ACTIVE';