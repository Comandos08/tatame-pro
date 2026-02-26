/**
 * ⚠️ SRP CONTRACT (PI U5)
 * - This hook DOES NOT decide rules
 * - This hook DOES NOT derive states
 * - All rules live in lib/state/*
 *
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

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import { failSafeAccess } from '@/lib/safety/failSafe';
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
  const { data, isLoading, isError, error } = useQuery({
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
  const asyncState = normalizeAsyncState({ data, isLoading, isError, error });

  // 3.1: Realtime invalidation — revoke access immediately on role change
  const queryClient = useQueryClient();
  const { session } = useCurrentUser();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId || !tenantId) return;

    const channel = supabase
      .channel(`access-invalidation-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['access-contract', tenantId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, tenantId, queryClient]);

  return {
    allowedFeatures,
    can: (featureKey: FeatureKey) => {
      // U9: fail-closed via canonical helper
      return failSafeAccess(
        allowedFeatures.has(featureKey),
        isLoading || !tenantId,
        isError,
      );
    },
    isLoading,
    isError,
    asyncState,
  };
}
