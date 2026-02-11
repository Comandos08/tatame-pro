/**
 * PI U10 — useNextBestAction (Thin Aggregator Hook)
 *
 * SRP CONTRACT:
 * - This hook DOES NOT decide rules
 * - This hook DOES NOT derive states
 * - All derivation lives in lib/ux/nextBestAction.ts
 * - This hook only collects data and calls the pure derive function
 */

import { useMemo } from 'react';
import { useIdentity } from '@/contexts/IdentityContext';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useAccessContract } from '@/hooks/useAccessContract';
import { assertTenantLifecycleState } from '@/domain/tenant/normalize';
import { failSafeAccess } from '@/lib/safety/failSafe';
import { deriveNextBestAction, type NextBestAction, type NextBestActionInput } from '@/lib/ux/nextBestAction';
import type { BillingStatus } from '@/lib/billing';
import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';

export function useNextBestAction(): NextBestAction {
  const { identityState, role } = useIdentity();
  const { tenant } = useTenant();
  const { billingStatus } = useTenantStatus();
  const { isLoading, isError } = useAccessContract(tenant?.id);

  const tenantLifecycle: TenantLifecycleState | null = tenant?.status
    ? assertTenantLifecycleState(tenant.status)
    : null;

  const input: NextBestActionInput = useMemo(() => ({
    identityState,
    tenantLifecycle,
    billingStatus: (billingStatus as BillingStatus) ?? null,
    hasTenant: !!tenant?.id,
    hasRole: !!role,
    canAccess: failSafeAccess(!isError && !isLoading, isLoading, isError),
  }), [identityState, tenantLifecycle, billingStatus, tenant?.id, role, isLoading, isError]);

  return useMemo(() => deriveNextBestAction(input), [input]);
}
