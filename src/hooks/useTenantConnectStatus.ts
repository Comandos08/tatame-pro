/**
 * useTenantConnectStatus — Stripe Connect (Express) status for a tenant.
 *
 * Thin data layer over the connect-account-refresh edge function, which
 * returns a deterministic snapshot even when the tenant has never onboarded
 * (connected: false). Used by the settings payouts card and the
 * not-ready warning banner.
 *
 * Fail-safe: any error resolves to a "not connected" snapshot so the UI can
 * always render the connect CTA instead of breaking.
 */
import { useQuery } from '@tanstack/react-query';
import { edgeInvoke } from '@/lib/edgeInvoke';

export interface TenantConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  platformFeeBps: number;
}

const NOT_CONNECTED: TenantConnectStatus = {
  connected: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  platformFeeBps: 500,
};

/**
 * True when the tenant can RECEIVE money via Connect (destination charges).
 * Mirrors isTenantReadyForCharges on the backend.
 */
export function isConnectReady(s: TenantConnectStatus | undefined): boolean {
  return !!s && s.connected && s.chargesEnabled;
}

export function useTenantConnectStatus(tenantId: string | undefined) {
  const query = useQuery({
    queryKey: ['tenant-connect-status', tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<TenantConnectStatus> => {
      const res = await edgeInvoke<TenantConnectStatus>('connect-account-refresh', {
        tenantId,
      });
      if (!res.ok) return NOT_CONNECTED;
      return {
        connected: !!res.data.connected,
        chargesEnabled: !!res.data.chargesEnabled,
        payoutsEnabled: !!res.data.payoutsEnabled,
        detailsSubmitted: !!res.data.detailsSubmitted,
        platformFeeBps:
          typeof res.data.platformFeeBps === 'number' ? res.data.platformFeeBps : 500,
      };
    },
  });

  return {
    status: query.data ?? NOT_CONNECTED,
    isLoading: query.isLoading,
    isReady: isConnectReady(query.data),
    refetch: query.refetch,
  };
}
