/**
 * useTenantSecurityHealth — Tenant-scoped security signal (SAFE GOLD)
 *
 * Derives a lightweight "has critical security events" flag from data the
 * ADMIN_TENANT already has permission to read via existing RLS policies:
 *   - audit_logs: rows with category='SECURITY' OR specific critical event_types
 *   - decision_logs: rows with severity IN ('HIGH','CRITICAL')
 *
 * Purpose: fallback signal for the SECURITY_OK onboarding step when the
 * authoritative audit-rls edge function is unavailable to the caller
 * (audit-rls is SUPERADMIN_GLOBAL only — tenant admins get 403).
 *
 * SRP CONTRACT:
 * - READ-ONLY. No mutations.
 * - Tenant-scoped via RLS (no manual tenant_id leak).
 * - Does NOT replace the authoritative audit-rls posture for superadmins.
 *
 * FAIL-SAFE: Query errors => hasCriticalEvents=null (unknown), so the
 * aggregator keeps the existing 'ERROR' posture instead of falsely flipping
 * the checklist to DONE.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Rolling window for "recent" critical events. 30 days matches the tenant
// operational observability window used by observability_critical_events view.
const LOOKBACK_DAYS = 30;

// Security event_types from the audit_logs taxonomy that indicate a critical
// posture signal for the tenant. Kept explicit (closed list) to avoid drift.
// Source: supabase/functions/_shared/audit-logger.ts AUDIT_EVENTS
const CRITICAL_SECURITY_EVENT_TYPES = [
  'TENANT_BOUNDARY_VIOLATION',
  'BILLING_ENV_MISMATCH_BLOCKED',
  'BILLING_KEY_UNKNOWN_BLOCKED',
  'BILLING_CONFIG_MISSING_BLOCKED',
  'BILLING_TRANSITION_BLOCKED',
  'BILLING_UNEXPECTED_ERROR',
] as const;

export interface TenantSecurityHealth {
  /**
   * - true:  at least 1 critical security event detected in the window
   * - false: zero critical events detected (tenant posture presumed clean)
   * - null:  unknown (query failed / loading / no tenant context) — fail-safe
   */
  hasCriticalEvents: boolean | null;
  isLoading: boolean;
}

export function useTenantSecurityHealth(tenantId: string | null | undefined): TenantSecurityHealth {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-security-health', tenantId],
    queryFn: async (): Promise<boolean | null> => {
      if (!tenantId) return null;

      const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Fail-safe: both queries in parallel; any error => null (unknown)
      const [auditResult, decisionResult] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', cutoff)
          .or(
            `category.eq.SECURITY,event_type.in.(${CRITICAL_SECURITY_EVENT_TYPES.join(',')})`,
          ),
        supabase
          .from('decision_logs')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', cutoff)
          .in('severity', ['HIGH', 'CRITICAL']),
      ]);

      if (auditResult.error || decisionResult.error) {
        return null;
      }

      const auditCount = auditResult.count ?? 0;
      const decisionCount = decisionResult.count ?? 0;
      return auditCount + decisionCount > 0;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    hasCriticalEvents: data ?? null,
    isLoading,
  };
}
