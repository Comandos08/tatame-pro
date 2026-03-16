/**
 * Hook para verificar se o usuário logado possui athlete em um tenant específico.
 * Também verifica se o usuário possui athlete em QUALQUER tenant (para mensagens diferenciadas).
 * 
 * @returns
 * - hasAthleteInTenant: boolean | undefined (undefined = loading)
 * - hasAthleteAnywhere: boolean | undefined (undefined = loading)
 * - isLoading: boolean
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import type { AsyncState } from '@/types/async';

interface UseHasAthleteInTenantResult {
  /** Se o usuário tem athlete neste tenant específico */
  hasAthleteInTenant: boolean | undefined;
  /** Se o usuário tem athlete em algum tenant (qualquer um) */
  hasAthleteAnywhere: boolean | undefined;
  /** Se a verificação ainda está carregando */
  isLoading: boolean;
  /** PI B1: Normalized async state */
  asyncState: AsyncState<{ hasAthleteInTenant: boolean; hasAthleteAnywhere: boolean }>;
}

export function useHasAthleteInTenant(tenantId: string | undefined): UseHasAthleteInTenantResult {
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();

  // Query 1: Verificar athlete neste tenant específico
  const { data: hasAthleteInTenant, isLoading: tenantCheckLoading } = useQuery({
    queryKey: ['athlete-tenant-check', currentUser?.id, tenantId],
    queryFn: async () => {
      if (!currentUser?.id || !tenantId) return false;
      const { data, error } = await supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', currentUser.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!currentUser?.id && !!tenantId && isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Query 2: Verificar se tem athlete em QUALQUER tenant (para Ajuste B)
  const { data: hasAthleteAnywhere, isLoading: anywhereCheckLoading } = useQuery({
    queryKey: ['athlete-anywhere-check', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return false;
      const { data, error } = await supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', currentUser.id)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!currentUser?.id && isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Loading composto (Ajuste C)
  const isLoading = authLoading || 
    (isAuthenticated && (tenantCheckLoading || anywhereCheckLoading));

  const asyncState: AsyncState<{ hasAthleteInTenant: boolean; hasAthleteAnywhere: boolean }> =
    isLoading
      ? { state: 'LOADING', data: null, error: null }
      : !isAuthenticated
        ? { state: 'EMPTY', data: null, error: null }
        : {
            state: 'OK',
            data: {
              hasAthleteInTenant: hasAthleteInTenant ?? false,
              hasAthleteAnywhere: hasAthleteAnywhere ?? false,
            },
            error: null,
          };

  return {
    hasAthleteInTenant: isAuthenticated ? hasAthleteInTenant : undefined,
    hasAthleteAnywhere: isAuthenticated ? hasAthleteAnywhere : undefined,
    isLoading,
    asyncState,
  };
}
