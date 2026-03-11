-- Phase 4: Missing indexes for query performance (P1-27)
-- Additive only — no destructive operations

-- Athletes: frequently queried by tenant + name search
CREATE INDEX IF NOT EXISTS idx_athletes_tenant_name
  ON public.athletes(tenant_id, full_name);

-- Athletes: lookup by email within tenant
CREATE INDEX IF NOT EXISTS idx_athletes_tenant_email
  ON public.athletes(tenant_id, email);

-- Athletes: lookup by national_id within tenant
CREATE INDEX IF NOT EXISTS idx_athletes_tenant_national_id
  ON public.athletes(tenant_id, national_id)
  WHERE national_id IS NOT NULL;

-- Memberships: status filtering (active, expired, etc.)
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_status
  ON public.memberships(tenant_id, status);

-- Memberships: payment status queries
CREATE INDEX IF NOT EXISTS idx_memberships_payment_status
  ON public.memberships(tenant_id, payment_status);

-- Memberships: date range queries (renewals, expirations)
CREATE INDEX IF NOT EXISTS idx_memberships_end_date
  ON public.memberships(end_date)
  WHERE end_date IS NOT NULL;

-- Events: tenant + date filtering
CREATE INDEX IF NOT EXISTS idx_events_tenant_date
  ON public.events(tenant_id, start_date DESC)
  WHERE start_date IS NOT NULL;

-- Audit logs: tenant + created_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON public.audit_logs(tenant_id, created_at DESC);

-- Profiles: email lookup
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email)
  WHERE email IS NOT NULL;
