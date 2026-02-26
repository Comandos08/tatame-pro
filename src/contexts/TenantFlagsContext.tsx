import React, { createContext, useContext } from 'react';
import { useTenantFlagsContract, type TenantFlagsContract, type ContractStatus } from '@/hooks/useTenantFlagsContract';

interface TenantFlagsContextValue {
  contract: TenantFlagsContract | null;
  status: ContractStatus;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const TenantFlagsContext = createContext<TenantFlagsContextValue | null>(null);

export function TenantFlagsProvider({ tenantId, children }: { tenantId: string | undefined; children: React.ReactNode }) {
  const result = useTenantFlagsContract(tenantId);

  return (
    <TenantFlagsContext.Provider value={{
      contract: result.contract,
      status: result.status,
      isLoading: result.isLoading,
      isError: result.isError,
      refetch: result.refetch,
    }}>
      {children}
    </TenantFlagsContext.Provider>
  );
}

export function useTenantFlags(): TenantFlagsContextValue {
  const ctx = useContext(TenantFlagsContext);
  if (!ctx) {
    throw new Error('useTenantFlags must be used within TenantFlagsProvider');
  }
  return ctx;
}
