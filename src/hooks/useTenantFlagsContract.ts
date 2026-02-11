/**
 * PI B2 — Canonical Tenant Flags Contract Hook
 * 
 * Single source of truth for critical tenant flags.
 * Consumes get_tenant_flags_contract RPC (SECURITY INVOKER).
 * 
 * FAIL-CLOSED:
 * - Loading/Error → returns null contract + explicit status
 * - Gates MUST NOT allow access when contract is null
 * - No heuristics, no inference, no "absence of error = ok"
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import type { AsyncState } from '@/types/async';

// Contract v1.0.0 — matches RPC output exactly
export interface TenantFlagsContract {
  tenant_id: string;
  onboarding_completed: boolean;
  billing: {
    status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'BLOCKED' | 'UNKNOWN';
    is_manual_override: boolean;
    has_billing_record: boolean;
  };
  evaluated_at: string;
  contract_version: '1.0.0';
}

export type ContractStatus = 'loading' | 'ready' | 'error';

export interface TenantFlagsContractResult {
  contract: TenantFlagsContract | null;
  status: ContractStatus;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** PI B1: Normalized async state */
  asyncState: AsyncState<TenantFlagsContract>;
}

// Stable restrictive fallback — never null fields
const RESTRICTIVE_FALLBACK: TenantFlagsContract = {
  tenant_id: '',
  onboarding_completed: false,
  billing: {
    status: 'UNKNOWN',
    is_manual_override: false,
    has_billing_record: false,
  },
  evaluated_at: new Date().toISOString(),
  contract_version: '1.0.0',
};

const VALID_BILLING_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'BLOCKED', 'UNKNOWN'] as const;

function validateContract(raw: unknown): TenantFlagsContract | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  
  if (typeof obj.tenant_id !== 'string') return null;
  if (typeof obj.onboarding_completed !== 'boolean') return null;
  if (!obj.billing || typeof obj.billing !== 'object') return null;
  
  const billing = obj.billing as Record<string, unknown>;
  const status = billing.status as string;
  if (!VALID_BILLING_STATUSES.includes(status as any)) return null;
  if (typeof billing.is_manual_override !== 'boolean') return null;
  if (typeof billing.has_billing_record !== 'boolean') return null;
  
  return obj as unknown as TenantFlagsContract;
}

export function useTenantFlagsContract(tenantId: string | undefined): TenantFlagsContractResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tenant-flags-contract', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      
      const { data, error } = await supabase.rpc('get_tenant_flags_contract', {
        p_tenant_id: tenantId,
      });

      if (error) throw error;
      
      const validated = validateContract(data);
      if (!validated) {
        logger.error('[B2-CONTRACT] Invalid contract payload from RPC:', data);
        return null;
      }
      
      return validated;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: 1,
  });

  const status: ContractStatus = isLoading ? 'loading' : isError ? 'error' : 'ready';
  const asyncState: AsyncState<TenantFlagsContract> = normalizeAsyncState({ data: data ?? undefined, isLoading, isError, error });
  
  return {
    contract: data ?? null,
    status,
    isLoading,
    isError,
    refetch,
    asyncState,
  };
}

/**
 * Helper: get restrictive contract for fail-closed scenarios
 */
export function getRestrictiveContract(tenantId?: string): TenantFlagsContract {
  return { ...RESTRICTIVE_FALLBACK, tenant_id: tenantId || '' };
}
