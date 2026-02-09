
-- ============================================================================
-- PI A4: Eliminação de Permissões Implícitas
-- Fix SECURITY DEFINER views → SECURITY INVOKER
-- Fix permissive policies
-- Add missing RLS policies
-- ============================================================================

-- ==========================================================================
-- PART 1: Convert SECURITY DEFINER views to SECURITY INVOKER
-- ==========================================================================

-- 1.1 membership_verification (security_invoker=OFF → ON)
-- This view is used for public verification of membership cards.
-- It joins memberships, tenants, athletes, digital_cards, athlete_gradings.
-- Making it INVOKER means RLS on underlying tables applies to the querying user.
ALTER VIEW public.membership_verification SET (security_invoker = on);

-- 1.2 job_execution_summary (no option → INVOKER)
-- Used by admin/observability. Reads from audit_logs.
-- With INVOKER, only superadmin/tenant admin can see (via audit_logs RLS).
ALTER VIEW public.job_execution_summary SET (security_invoker = on);

-- 1.3 observability_critical_events (no option → INVOKER)
-- Reads from audit_logs + decision_logs.
ALTER VIEW public.observability_critical_events SET (security_invoker = on);

-- 1.4 security_timeline (no option → INVOKER)
-- Reads from decision_logs + security_events.
ALTER VIEW public.security_timeline SET (security_invoker = on);

-- ==========================================================================
-- PART 2: Add RLS policies for audit_logs SELECT (needed for views to work)
-- Currently audit_logs has no SELECT policy, only no_delete and no_update.
-- ==========================================================================

-- Superadmins and tenant admins can read audit logs for their tenant
CREATE POLICY "Superadmin can read all audit_logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (is_superadmin());

CREATE POLICY "Tenant admins can read own tenant audit_logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (is_tenant_admin(tenant_id));

-- Service role and authenticated users can insert audit logs (needed for audit trail)
CREATE POLICY "Authenticated users can insert audit_logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ==========================================================================
-- PART 3: Add RLS policies for decision_logs SELECT
-- Currently has no_delete, no_update, and service_insert only.
-- ==========================================================================

CREATE POLICY "Superadmin can read all decision_logs"
  ON public.decision_logs
  FOR SELECT
  TO authenticated
  USING (is_superadmin());

CREATE POLICY "Tenant admins can read own tenant decision_logs"
  ON public.decision_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id));

-- ==========================================================================
-- PART 4: Add RLS policies for security_events SELECT
-- Currently has no_delete and no_update only (no SELECT).
-- ==========================================================================

CREATE POLICY "Superadmin can read all security_events"
  ON public.security_events
  FOR SELECT
  TO authenticated
  USING (is_superadmin());

CREATE POLICY "Tenant admins can read own tenant security_events"
  ON public.security_events
  FOR SELECT
  TO authenticated
  USING (tenant_id IS NOT NULL AND is_tenant_admin(tenant_id));

-- ==========================================================================
-- PART 5: Add RLS policy for webhook_events (RLS enabled, no policies)
-- ==========================================================================

CREATE POLICY "Only service_role can access webhook_events"
  ON public.webhook_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- ==========================================================================
-- PART 6: Tighten membership_verification view access
-- The view is used for PUBLIC card verification (QR scan).
-- With INVOKER now, RLS on memberships table applies.
-- The existing memberships policy "Public can view membership via card verification"
-- already restricts to membership_has_digital_card(id), which is correct.
-- No additional changes needed.
-- ==========================================================================

-- ==========================================================================
-- PART 7: Add explicit SELECT policies for event management tables
-- (tenant admin access for event_brackets, event_bracket_matches, event_categories,
--  event_registrations, event_results — currently only have public SELECT
--  for published/public events, but admin needs full access)
-- ==========================================================================

-- event_brackets: admin access
CREATE POLICY "Tenant admins can manage event_brackets"
  ON public.event_brackets
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- event_bracket_matches: admin access
CREATE POLICY "Tenant admins can manage event_bracket_matches"
  ON public.event_bracket_matches
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- event_categories: admin access (for managing categories beyond just viewing public ones)
CREATE POLICY "Tenant admins can manage event_categories"
  ON public.event_categories
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- event_registrations: admin access
CREATE POLICY "Tenant admins can manage event_registrations"
  ON public.event_registrations
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- event_results: admin can insert (immutable table, existing trigger prevents update/delete)
CREATE POLICY "Tenant admins can insert event_results"
  ON public.event_results
  FOR INSERT
  TO authenticated
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- events: admin full access
CREATE POLICY "Tenant admins can manage events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- ==========================================================================
-- PART 8: Ensure documents and digital_cards have admin access
-- ==========================================================================

CREATE POLICY "Tenant admins can manage documents"
  ON public.documents
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admins can manage digital_cards"
  ON public.digital_cards
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));

-- ==========================================================================
-- PART 9: Tenant admins SELECT on memberships (currently only UPDATE exists)
-- ==========================================================================

CREATE POLICY "Tenant admins can select memberships"
  ON public.memberships
  FOR SELECT
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id));

-- ==========================================================================
-- PART 10: Tenant admins manage athletes (currently only SELECT exists for admins)
-- ==========================================================================

CREATE POLICY "Tenant admins can manage athletes"
  ON public.athletes
  FOR ALL
  TO authenticated
  USING (is_superadmin() OR is_tenant_admin(tenant_id))
  WITH CHECK (is_superadmin() OR is_tenant_admin(tenant_id));
