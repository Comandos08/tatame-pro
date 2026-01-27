/**
 * 🔐 usePermissions — React Hook for Permission Checks
 * 
 * A hook that combines tenant roles with the permission system
 * for easy use in React components.
 */

import { useMemo } from 'react';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantRoles } from '@/hooks/useTenantRoles';
import { FeatureKey } from '@/lib/accessMatrix';
import { createPermissionContext, PermissionContext, Permissions } from '@/lib/can';
import { AppRole } from '@/types/auth';

export interface UsePermissionsResult extends PermissionContext {
  /** Whether permissions are still loading */
  isLoading: boolean;
  /** Whether permissions have been fetched */
  isFetched: boolean;
  /** The current tenant ID */
  tenantId: string | null;
  /** Error if any occurred */
  error: Error | null;
  /** Pre-defined permission checks */
  permissions: typeof Permissions;
}

/**
 * Hook to check user permissions in the current tenant context.
 * 
 * @returns UsePermissionsResult with permission checking functions
 * 
 * @example
 * const { can, permissions, isLoading } = usePermissions();
 * 
 * if (isLoading) return <Spinner />;
 * 
 * if (permissions.approveMembers(roles)) {
 *   return <ApproveButton />;
 * }
 * 
 * // Or use the can() function
 * if (can('TENANT_APPROVALS')) {
 *   return <ApprovalsLink />;
 * }
 */
export function usePermissions(): UsePermissionsResult {
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { roles, isLoading: rolesLoading, isFetched, error } = useTenantRoles(tenant?.id);

  const isLoading = authLoading || tenantLoading || rolesLoading;

  const permissionContext = useMemo(() => {
    return createPermissionContext(roles, isGlobalSuperadmin);
  }, [roles, isGlobalSuperadmin]);

  return {
    ...permissionContext,
    isLoading,
    isFetched,
    tenantId: tenant?.id || null,
    error,
    permissions: Permissions,
  };
}

/**
 * Hook to check a specific permission.
 * More efficient if you only need one check.
 * 
 * @param feature - The feature to check access for
 * @returns { allowed: boolean, isLoading: boolean }
 */
export function useCanAccess(feature: FeatureKey): { allowed: boolean; isLoading: boolean } {
  const { can, isLoading } = usePermissions();
  
  return {
    allowed: can(feature),
    isLoading,
  };
}

/**
 * Hook to get the current user's roles for the active tenant.
 * 
 * @returns { roles: AppRole[], isLoading: boolean }
 */
export function useCurrentRoles(): { roles: AppRole[]; isLoading: boolean } {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { roles, isLoading: rolesLoading } = useTenantRoles(tenant?.id);
  
  return {
    roles,
    isLoading: tenantLoading || rolesLoading,
  };
}
