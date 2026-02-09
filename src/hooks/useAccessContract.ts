/**
 * 🔐 useAccessContract — Backend-Driven Access Control Hook
 * 
 * PI A3: Single source of truth for feature access.
 * Calls list_allowed_features RPC and exposes a deterministic can() function.
 * 
 * FAIL-CLOSED:
 * - Loading → no access
 * - Error → no access
 * - Feature not in set → no access
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import type { AsyncState } from '@/types/async';

export type FeatureKey = string;

interface UseAccessContractResult {
  /** Set of features the current user can access */
  allowedFeatures: Set<string>;
  /** Deterministic check: can user access this feature? */
  can: (featureKey: FeatureKey) => boolean;
  /** Whether the contract is still loading */
  isLoading: boolean;
  /** Whether the RPC call failed */
  isError: boolean;
  /** PI B1: Normalized async state */
  asyncState: AsyncState<string[]>;
}

export function useAccessContract(tenantId: string | undefined | null): UseAccessContractResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['access-contract', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.rpc('list_allowed_features', {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return (data as string[]) || [];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 min cache
    gcTime: 10 * 60 * 1000,
  });

  const allowedFeatures = new Set(data || []);
  const asyncState = normalizeAsyncState({ data, isLoading, isError, error: null });

  return {
    allowedFeatures,
    can: (featureKey: FeatureKey) => {
      // FAIL-CLOSED: loading or error → deny
      if (isLoading || isError || !tenantId) return false;
      return allowedFeatures.has(featureKey);
    },
    isLoading,
    isError,
    asyncState,
  };
}
