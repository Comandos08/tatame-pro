-- =============================================================================
-- P3-FIX 3.7: Live sync trigger for tenants.status ↔ tenants.lifecycle_status
-- =============================================================================
-- tenants.status        TEXT  — legacy column set by application code
-- tenants.lifecycle_status  tenant_lifecycle_status ENUM — introduced in
--   20260208204123 with a one-time data migration (no live sync).
--
-- Without a trigger, either column can drift from the other depending on which
-- code path updates the tenant.  This trigger keeps them permanently in sync
-- on every UPDATE, propagating whichever column changed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_tenant_status_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- lifecycle_status changed → propagate to status (TEXT)
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
     AND NEW.status IS NOT DISTINCT FROM OLD.status
  THEN
    NEW.status := NEW.lifecycle_status::text;
  END IF;

  -- status (TEXT) changed → propagate to lifecycle_status (ENUM)
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.lifecycle_status IS NOT DISTINCT FROM OLD.lifecycle_status
  THEN
    NEW.lifecycle_status := CASE
      WHEN NEW.status = 'SETUP'                      THEN 'SETUP'::tenant_lifecycle_status
      WHEN NEW.status IN ('BLOCKED', 'SUSPENDED')    THEN 'BLOCKED'::tenant_lifecycle_status
      ELSE                                                 'ACTIVE'::tenant_lifecycle_status
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenant_status ON public.tenants;

CREATE TRIGGER trg_sync_tenant_status
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_status_columns();

COMMENT ON FUNCTION public.sync_tenant_status_columns() IS
  'Keeps tenants.status (TEXT) and tenants.lifecycle_status (ENUM) in sync '
  'on every UPDATE. If lifecycle_status changes, status is updated to its '
  'text representation. If status changes, lifecycle_status is mapped '
  'accordingly: SETUP→SETUP, BLOCKED/SUSPENDED→BLOCKED, *→ACTIVE.';
