
-- STEP 1: Create test tenant with required sport_types
INSERT INTO public.tenants (id, slug, name, is_active, lifecycle_status, status, sport_types)
VALUES ('00000000-0000-0000-0000-000000000001', 'test-validation-v1', 'Validation Test Tenant', true, 'ACTIVE', 'ACTIVE', ARRAY['BJJ'])
ON CONFLICT (id) DO NOTHING;
