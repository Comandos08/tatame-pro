-- ============================================================================
-- GAP 2: Tenant Onboarding Fields
-- ============================================================================
-- Add onboarding tracking to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS onboarding_completed_by UUID NULL REFERENCES public.profiles(id);

-- Index for quick filtering of incomplete onboarding
CREATE INDEX IF NOT EXISTS idx_tenants_onboarding_incomplete 
ON public.tenants(is_active, onboarding_completed) 
WHERE is_active = true AND onboarding_completed = false;

-- ============================================================================
-- GAP 3: Role Audit Events Support
-- No new tables needed, just documenting the audit log event types:
-- - ROLES_GRANTED (already exists in approve-membership)
-- - ROLES_REVOKED (new)
-- - ROLES_CHANGED (optional)
-- ============================================================================

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON COLUMN public.tenants.onboarding_completed IS 'Whether the tenant has completed initial setup wizard';
COMMENT ON COLUMN public.tenants.onboarding_completed_at IS 'When the onboarding was marked complete';
COMMENT ON COLUMN public.tenants.onboarding_completed_by IS 'Who completed the onboarding wizard';