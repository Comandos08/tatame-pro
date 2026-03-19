-- Migration: Add STAFF_ORGANIZACAO to feature_access allowed_roles
--
-- Root cause: STAFF_ORGANIZACAO users were normalized to ADMIN_TENANT by the
-- identity engine for routing, but list_allowed_features() queries the actual
-- DB role. Since STAFF_ORGANIZACAO was absent from all feature allowed_roles,
-- can() returned false for every feature → empty sidebar for staff users.
--
-- Fix: Add STAFF_ORGANIZACAO to all features whose corresponding AppRouter routes
-- already allow ["ADMIN_TENANT", "STAFF_ORGANIZACAO"] in RequireRoles.
-- Admin-only features (AUDIT_LOG, SECURITY, BILLING, SETTINGS) are intentionally
-- excluded to keep sidebar items aligned with route access control.

UPDATE public.feature_access
SET allowed_roles = array_append(allowed_roles, 'STAFF_ORGANIZACAO')
WHERE feature_key IN (
  'TENANT_APP',
  'TENANT_DASHBOARD',
  'TENANT_ATHLETES',
  'TENANT_MEMBERSHIPS',
  'TENANT_ACADEMIES',
  'TENANT_COACHES',
  'TENANT_GRADINGS',
  'TENANT_APPROVALS',
  'TENANT_RANKINGS',
  'TENANT_EVENTS',
  'TENANT_MY_AREA',
  'TENANT_HELP'
)
AND NOT ('STAFF_ORGANIZACAO' = ANY(allowed_roles));
