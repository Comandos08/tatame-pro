/**
 * 🔐 usePermissions — React Hook for Permission Checks
 * 
 * PI A3: Now delegates to useAccessContract (backend contract).
 * The local accessMatrix is no longer the source of truth.
 */

import { useCurrentUser } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useAccessContract, FeatureKey } from '@/hooks/useAccessContract';

export interface UsePermissionsResult {
  /** Whether permissions are still loading */
  isLoading: boolean;
  /** Check if user can access a feature (backend-driven) */
  can: (feature: FeatureKey) => boolean;
  /** Check if user can access any of the features */
  canAny: (features: FeatureKey[]) => boolean;
  /** Whether user is global superadmin */
  isGlobalSuperadmin: boolean;
}

/**
 * Hook to check user permissions via backend contract.
 * Replaces the old local accessMatrix-based check.
 */
export function usePermissions(): UsePermissionsResult {
  const { isGlobalSuperadmin } = useCurrentUser();
  const { tenant } = useTenant();
  const { can, isLoading } = useAccessContract(tenant?.id);

  return {
    isLoading,
    can,
    canAny: (features: FeatureKey[]) => features.some(f => can(f)),
    isGlobalSuperadmin,
  };
}

/**
 * Hook to check a specific permission.
 */
export function useCanAccess(feature: FeatureKey): { allowed: boolean; isLoading: boolean } {
  const { can, isLoading } = usePermissions();
  
  return {
    allowed: can(feature),
    isLoading,
  };
}
