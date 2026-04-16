/**
 * PI-U02 — useTenantOnboarding (Thin Aggregator Hook)
 *
 * SRP CONTRACT:
 * - This hook DOES NOT decide rules
 * - This hook DOES NOT derive states
 * - All derivation lives in domain/onboarding/deriveTenantOnboarding.ts
 * - This hook only collects data and calls the pure derive function
 *
 * No side effects. No mutations. No auditEvent.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { useIdentity } from '@/contexts/IdentityContext';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useSecurityPosture, type SecurityPostureState } from '@/hooks/admin/useSecurityPosture';
import { useTenantSecurityHealth } from '@/hooks/tenant/useTenantSecurityHealth';
import { supabase } from '@/integrations/supabase/client';
import { assertTenantLifecycleState } from '@/domain/tenant/normalize';
import { deriveTenantOnboarding, type TenantOnboardingResult } from '@/domain/onboarding/deriveTenantOnboarding';

function mapPostureState(state: SecurityPostureState): 'OK' | 'WARNING' | 'CRITICAL' | 'ERROR' {
  switch (state) {
    case 'OK': return 'OK';
    case 'WARNING': return 'WARNING';
    case 'CRITICAL': return 'CRITICAL';
    default: return 'ERROR';
  }
}

/**
 * Resolve effective security posture for the onboarding checklist.
 *
 * The authoritative source is `useSecurityPosture` (calls the audit-rls edge
 * function, SUPERADMIN_GLOBAL-only). For ADMIN_TENANT callers that function
 * returns 403 and the hook degrades to `ERROR`, leaving SECURITY_OK forever
 * PENDING in the checklist.
 *
 * Fallback rule (fail-safe):
 *   - When the authoritative state is OK/WARNING/CRITICAL → use it as-is.
 *   - When it is ERROR/LOADING AND the tenant-scoped signal proves zero
 *     critical security events in the rolling window → treat as OK.
 *   - When the tenant-scoped signal returns `null` (unknown: query failed
 *     or still loading) → keep ERROR so we never falsely mark the step DONE.
 */
function resolveEffectivePosture(
  authoritative: 'OK' | 'WARNING' | 'CRITICAL' | 'ERROR',
  tenantHasCriticalEvents: boolean | null,
): 'OK' | 'WARNING' | 'CRITICAL' | 'ERROR' {
  if (authoritative !== 'ERROR') return authoritative;
  if (tenantHasCriticalEvents === false) return 'OK';
  if (tenantHasCriticalEvents === true) return 'CRITICAL';
  return 'ERROR';
}

export function useTenantOnboarding(): TenantOnboardingResult & { isLoading: boolean } {
  const { tenant } = useTenant();
  const { role } = useIdentity();
  const { billingStatus } = useTenantStatus();
  const { postureState } = useSecurityPosture();
  const { hasCriticalEvents } = useTenantSecurityHealth(tenant?.id ?? null);

  // Fetch membership count for this tenant
  const { data: membershipCount, isLoading: isMembershipLoading } = useQuery({
    queryKey: ['tenant-membership-count', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 0;
      const { count, error } = await supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .in('status', ['ACTIVE', 'APPROVED']);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!tenant?.id,
    staleTime: 60_000,
  });

  const tenantLifecycle = tenant?.status
    ? assertTenantLifecycleState(tenant.status)
    : null;

  const effectivePosture = resolveEffectivePosture(
    mapPostureState(postureState),
    hasCriticalEvents,
  );

  const result = useMemo(() => deriveTenantOnboarding({
    tenantLifecycle,
    hasRole: !!role,
    membershipCount: membershipCount ?? 0,
    billingStatus: billingStatus ?? null,
    securityPosture: effectivePosture,
  }), [tenantLifecycle, role, membershipCount, billingStatus, effectivePosture]);

  return {
    ...result,
    isLoading: isMembershipLoading,
  };
}
