/**
 * PI U18 — useSystemSelfAwareness (Aggregator Hook)
 *
 * SRP CONTRACT:
 * - This hook DOES NOT decide rules
 * - This hook DOES NOT derive states
 * - All derivation lives in lib/system/selfAwareness.ts
 * - This hook only collects data and calls the pure derive function
 */

import { useMemo } from 'react';
import { useIdentity } from '@/contexts/IdentityContext';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useTenant } from '@/contexts/TenantContext';
import { deriveSystemAwarenessState, type SystemAwarenessState, type SystemAwarenessInput } from '@/lib/system/selfAwareness';
import { assertTenantLifecycleState } from '@/domain/tenant/normalize';
import type { SafeHealthStatus } from '@/types/health-state';
import type { BillingStatus } from '@/lib/billing';
import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';

export function useSystemSelfAwareness(): SystemAwarenessState {
  const { identityState } = useIdentity();
  const { tenant } = useTenant();
  const { billingStatus, isTrialEndingSoon, daysToTrialEnd } = useTenantStatus();

  // Derive tenant lifecycle from existing normalized function
  const tenantLifecycle: TenantLifecycleState | null = tenant?.status
    ? assertTenantLifecycleState(tenant.status)
    : null;

  // Health: for now, default to OK since health is only accessible
  // to SUPERADMIN_GLOBAL via /admin/health. Non-admins get OK.
  // Future: inject from a lightweight health ping if needed.
  const health: SafeHealthStatus = 'OK';

  const input: SystemAwarenessInput = useMemo(() => ({
    health,
    tenantStatus: tenantLifecycle,
    billingStatus: (billingStatus as BillingStatus) ?? null,
    identityState,
    tenantSlug: tenant?.slug ?? null,
    isTrialEndingSoon,
    daysToTrialEnd,
  }), [health, tenantLifecycle, billingStatus, identityState, tenant?.slug, isTrialEndingSoon, daysToTrialEnd]);

  return useMemo(() => deriveSystemAwarenessState(input), [input]);
}
