/**
 * Hook para verificar status de billing override do tenant
 * Wrapper do useTenantStatus para manter API existente
 */

import { useTenantStatus } from './useTenantStatus';

interface BillingOverrideStatus {
  isManualOverride: boolean;
  overrideReason: string | null;
  overrideAt: Date | null;
  canUseStripe: boolean;
  isLoading: boolean;
}

export function useBillingOverride(): BillingOverrideStatus {
  const { billingState, isLoading } = useTenantStatus();

  return {
    isManualOverride: billingState?.isManualOverride ?? false,
    overrideReason: billingState?.overrideReason ?? null,
    overrideAt: billingState?.overrideAt ?? null,
    canUseStripe: billingState?.canUseStripe ?? true,
    isLoading,
  };
}
