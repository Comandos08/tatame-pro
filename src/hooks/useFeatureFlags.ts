/**
 * PI U15 — useFeatureFlags
 *
 * Canonical hook for institutional feature flags.
 * Thin data layer — NO business logic.
 *
 * Contract:
 * - Default = false (fail-closed)
 * - Never blocks login or navigation
 * - Cacheável (5 min staleTime)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  type InstitutionalFeatureFlag,
  type FeatureFlagMap,
  buildDefaultFlagMap,
} from '@/lib/featureFlags';

export interface UseFeatureFlagsResult {
  /** Check if a flag is enabled (fail-closed: false on error/loading) */
  isEnabled: (flag: InstitutionalFeatureFlag) => boolean;
  /** The resolved flag map */
  flags: FeatureFlagMap;
  /** Whether flags are still loading */
  isLoading: boolean;
}

export function useFeatureFlags(tenantId?: string): UseFeatureFlagsResult {
  const { data: flags = buildDefaultFlagMap(), isLoading } = useQuery({
    queryKey: ['institutional-feature-flags', tenantId],
    queryFn: async (): Promise<FeatureFlagMap> => {
      if (!tenantId) return buildDefaultFlagMap();

      const { data, error } = await supabase.functions.invoke(
        'resolve-feature-flags',
        { body: { tenantId } }
      );

      if (error || !data) {
        console.error('[U15-FLAGS] Edge Function failed:', error);
        return buildDefaultFlagMap();
      }

      // Merge response into a complete flag map (missing flags default false)
      const defaults = buildDefaultFlagMap();
      return { ...defaults, ...data } as FeatureFlagMap;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    isEnabled: (flag: InstitutionalFeatureFlag) => flags[flag] ?? false,
    flags,
    isLoading,
  };
}
