
-- ============================================================================
-- PI U16 — INSTITUTIONAL TIMELINE (append-only)
-- ============================================================================

CREATE TABLE public.institutional_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  domain text NOT NULL,
  type text NOT NULL,
  tenant_id uuid,
  actor_user_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Append-only: no UPDATE, no DELETE
ALTER TABLE public.institutional_events ENABLE ROW LEVEL SECURITY;

-- INSERT: only service_role (edge functions)
CREATE POLICY "institutional_events_service_insert"
  ON public.institutional_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role'::text);

-- SELECT: only superadmins
CREATE POLICY "institutional_events_superadmin_read"
  ON public.institutional_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'SUPERADMIN_GLOBAL'
        AND tenant_id IS NULL
    )
  );

-- Explicit deny UPDATE/DELETE
CREATE POLICY "institutional_events_no_update"
  ON public.institutional_events
  FOR UPDATE
  USING (false);

CREATE POLICY "institutional_events_no_delete"
  ON public.institutional_events
  FOR DELETE
  USING (false);

-- Index for querying by domain/type
CREATE INDEX idx_institutional_events_domain_type
  ON public.institutional_events (domain, type, occurred_at DESC);

-- Index for tenant scoping
CREATE INDEX idx_institutional_events_tenant
  ON public.institutional_events (tenant_id, occurred_at DESC)
  WHERE tenant_id IS NOT NULL;
