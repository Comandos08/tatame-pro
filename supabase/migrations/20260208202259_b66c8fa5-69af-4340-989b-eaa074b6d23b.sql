-- PI-RESET-001: Controlled Database Reset (SAFE GOLD)
-- Preserves auth.users, recreates only SUPERADMIN profile

-- 1. Disable triggers temporarily for clean truncation
SET session_replication_role = 'replica';

-- 2. Truncate all business tables in FK-safe order (leaf tables first)

-- Event system (deepest dependencies first)
TRUNCATE TABLE event_bracket_matches CASCADE;
TRUNCATE TABLE event_brackets CASCADE;
TRUNCATE TABLE event_results CASCADE;
TRUNCATE TABLE event_registrations CASCADE;
TRUNCATE TABLE event_categories CASCADE;
TRUNCATE TABLE events CASCADE;

-- Athlete/Grading system
TRUNCATE TABLE athlete_gradings CASCADE;
TRUNCATE TABLE diplomas CASCADE;
TRUNCATE TABLE digital_cards CASCADE;
TRUNCATE TABLE documents CASCADE;

-- Guardian system
TRUNCATE TABLE guardian_links CASCADE;
TRUNCATE TABLE guardians CASCADE;

-- Academy/Coach system
TRUNCATE TABLE academy_coaches CASCADE;
TRUNCATE TABLE coaches CASCADE;
TRUNCATE TABLE academies CASCADE;

-- Grading system
TRUNCATE TABLE grading_levels CASCADE;
TRUNCATE TABLE grading_schemes CASCADE;

-- Membership system
TRUNCATE TABLE memberships CASCADE;
TRUNCATE TABLE athletes CASCADE;

-- Billing system
TRUNCATE TABLE tenant_invoices CASCADE;
TRUNCATE TABLE tenant_billing CASCADE;

-- Audit/Security logs (can be truncated)
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE decision_logs CASCADE;
TRUNCATE TABLE security_events CASCADE;
TRUNCATE TABLE deleted_tenants CASCADE;
TRUNCATE TABLE observability_dismissed_alerts CASCADE;

-- Auth support tables
TRUNCATE TABLE password_resets CASCADE;
TRUNCATE TABLE user_roles CASCADE;

-- Profiles (will recreate SUPERADMIN)
TRUNCATE TABLE profiles CASCADE;

-- Tenants (core entity)
TRUNCATE TABLE tenants CASCADE;

-- 3. Re-enable triggers
SET session_replication_role = 'origin';

-- 4. Recreate SUPERADMIN profile from auth.users
INSERT INTO profiles (id, email, name, tenant_id, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'name', 'Superadmin Global'),
  NULL,
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email = 'global@tatame.pro'
ON CONFLICT (id) DO NOTHING;

-- 5. Recreate SUPERADMIN role
INSERT INTO user_roles (user_id, role, tenant_id, created_at)
SELECT 
  au.id,
  'SUPERADMIN_GLOBAL'::app_role,
  NULL,
  NOW()
FROM auth.users au
WHERE au.email = 'global@tatame.pro'
ON CONFLICT DO NOTHING;