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

export function useTenantOnboarding(): TenantOnboardingResult & { isLoading: boolean } {
  const { tenant } = useTenant();
  const { role } = useIdentity();
  const { billingStatus } = useTenantStatus();
  const { postureState } = useSecurityPosture();

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

  const result = useMemo(() => deriveTenantOnboarding({
    tenantLifecycle,
    hasRole: !!role,
    membershipCount: membershipCount ?? 0,
    billingStatus: billingStatus ?? null,
    securityPosture: mapPostureState(postureState),
  }), [tenantLifecycle, role, membershipCount, billingStatus, postureState]);

  return {
    ...result,
    isLoading: isMembershipLoading,
  };
}
