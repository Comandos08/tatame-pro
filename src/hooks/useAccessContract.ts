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

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import { failSafeAccess } from '@/lib/safety/failSafe';
import type { AsyncState } from '@/types/async';

export type FeatureKey = string;

interface UseAccessContractResult {
  allowedFeatures: Set<string>;
  can: (featureKey: FeatureKey) => boolean;
  isLoading: boolean;
  isError: boolean;
  asyncState: AsyncState<string[]>;
}

// Global registry to prevent duplicate Realtime channels
const activeChannels = new Map<string, ReturnType<typeof supabase.channel>>();

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
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const allowedFeatures = new Set(data || []);
  const asyncState = normalizeAsyncState({ data, isLoading, isError, error });

  const queryClient = useQueryClient();
  const { session } = useCurrentUser();
  const userId = session?.user?.id;
  const channelKey = `access-invalidation-${tenantId}-${userId}`;
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!userId || !tenantId) return;

    // If channel already exists globally, skip — another instance is handling it
    if (activeChannels.has(channelKey)) return;

    registeredRef.current = true;

    const channel = supabase
      .channel(channelKey)
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

    activeChannels.set(channelKey, channel);

    return () => {
      if (registeredRef.current) {
        const ch = activeChannels.get(channelKey);
        if (ch) {
          supabase.removeChannel(ch);
          activeChannels.delete(channelKey);
        }
        registeredRef.current = false;
      }
    };
  }, [userId, tenantId, queryClient, channelKey]);

  return {
    allowedFeatures,
    can: (featureKey: FeatureKey) => {
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
