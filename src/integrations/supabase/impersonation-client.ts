/**
 * 🔐 Impersonation-Aware Supabase Client
 * 
 * Cria clients Supabase com header x-impersonation-id injetado
 * automaticamente quando há sessão de impersonation ativa.
 * 
 * AJUSTE A1: Depende do state do ImpersonationContext (reativo)
 * AJUSTE A2: Cache limpo via clearImpersonationClientCache()
 * 
 * SAFE MODE: Este módulo NÃO altera o client padrão existente.
 * É um wrapper opcional para componentes Admin que precisam
 * de impersonation em queries PostgREST.
 */

import { useMemo } from 'react';
import { logger } from '@/lib/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Cache de clients por impersonationId
const clientCache = new Map<string, SupabaseClient<Database>>();

/**
 * Cria um client Supabase com header x-impersonation-id opcional.
 * Memoizado por impersonationId para evitar recriação desnecessária.
 */
export function createImpersonationAwareClient(
  impersonationId: string | null
): SupabaseClient<Database> {
  const cacheKey = impersonationId || 'default';
  
  // Retorna do cache se existir
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;
  
  // Configuração base (idêntica ao client padrão)
  const options: Parameters<typeof createClient>[2] = {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  };
  
  // Injeta header se houver impersonation ativa
  if (impersonationId) {
    options.global = {
      headers: { 'x-impersonation-id': impersonationId },
    };
    logger.log('[IMPERSONATION-CLIENT] Created client with header:', impersonationId.slice(0, 8) + '...');
  }
  
  const client = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    options
  );
  
  // Limita tamanho do cache para evitar memory leak
  if (clientCache.size > 10) {
    const defaultClient = clientCache.get('default');
    clientCache.clear();
    if (defaultClient) clientCache.set('default', defaultClient);
  }
  
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Hook para uso em componentes React.
 * AJUSTE A1: Recebe impersonationId do Context (fonte reativa).
 * 
 * @param impersonationId - ID da sessão de impersonation (do ImpersonationContext)
 * @returns SupabaseClient com ou sem header de impersonation
 * 
 * @example
 * const { session } = useImpersonation();
 * const supabase = useImpersonationClient(session?.impersonationId);
 */
export function useImpersonationClient(
  impersonationId: string | null | undefined
): SupabaseClient<Database> {
  return useMemo(
    () => createImpersonationAwareClient(impersonationId ?? null),
    [impersonationId]
  );
}

/**
 * Limpa o cache de clients (exceto default).
 * AJUSTE A2: Deve ser chamado ao encerrar impersonation.
 * 
 * Esta função é chamada automaticamente pelo ImpersonationContext
 * quando a sessão é encerrada, expirada ou revogada.
 */
export function clearImpersonationClientCache(): void {
  const defaultClient = clientCache.get('default');
  const cacheSize = clientCache.size;
  clientCache.clear();
  if (defaultClient) clientCache.set('default', defaultClient);
  logger.log(`[IMPERSONATION-CLIENT] Cache cleared (${cacheSize - 1} impersonation clients removed)`);
}
