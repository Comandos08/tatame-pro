-- ============================================================
-- SEED: feature_access — canonical seed idempotente
-- Garante que todas as features estejam cadastradas em produção
-- Usa ON CONFLICT para ser seguro de re-executar
-- ============================================================

INSERT INTO public.feature_access (feature_key, scope, allowed_roles) VALUES
  -- Tenant App routes
  ('TENANT_APP',        'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_DASHBOARD',  'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_ATHLETES',   'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_MEMBERSHIPS','TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_ACADEMIES',  'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_COACHES',    'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_GRADINGS',   'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_APPROVALS',  'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_RANKINGS',   'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_EVENTS',     'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO']),
  ('TENANT_MY_AREA',    'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO', 'ATLETA']),
  ('TENANT_HELP',       'TENANT', ARRAY['ADMIN_TENANT', 'STAFF_ORGANIZACAO', 'ATLETA']),
  -- Admin-only
  ('TENANT_AUDIT_LOG',   'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_SECURITY',    'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_SETTINGS',    'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_BILLING',     'TENANT', ARRAY['ADMIN_TENANT']),
  ('TENANT_DIAGNOSTICS', 'TENANT', ARRAY['ADMIN_TENANT']),
  -- Portal routes
  ('ATHLETE_PORTAL',        'TENANT', ARRAY['ATLETA', 'ADMIN_TENANT']),
  ('ATHLETE_PORTAL_EVENTS', 'TENANT', ARRAY['ATLETA', 'ADMIN_TENANT']),
  ('ATHLETE_PORTAL_CARD',   'TENANT', ARRAY['ATLETA', 'ADMIN_TENANT']),
  -- Global admin
  ('GLOBAL_ADMIN', 'GLOBAL', ARRAY['SUPERADMIN_GLOBAL'])
ON CONFLICT (feature_key) DO UPDATE
  SET allowed_roles = EXCLUDED.allowed_roles,
      is_active     = true,
      updated_at    = now();
