-- P1-FIX: Enforce that ACTIVE tenants must have at least one sport type.
-- Tenants in SETUP or SUSPENDED status may have an empty sport_types array
-- (allowed during onboarding wizard setup).
-- This constraint prevents superadmin bypass from creating ACTIVE tenants
-- with no sport types configured.

ALTER TABLE tenants
  ADD CONSTRAINT tenants_active_requires_sport_types
  CHECK (
    status != 'ACTIVE'
    OR (sport_types IS NOT NULL AND cardinality(sport_types) >= 1)
  );

COMMENT ON CONSTRAINT tenants_active_requires_sport_types ON tenants
  IS 'P1-FIX: ACTIVE tenants must have at least 1 sport type. SETUP/SUSPENDED tenants may have sport_types empty.';
