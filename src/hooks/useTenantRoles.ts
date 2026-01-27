/**
 * 🔐 useTenantRoles — Role Resolver with Caching
 * 
 * Central hook for resolving user roles within a specific tenant.
 * Uses React Query for caching to minimize database queries.
 * 
 * RULES:
 * - Only user_roles table is the source
 * - Deny by default on error
 * - No heuristics
 * - Cache per session
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppRole } from '@/types/auth';
import { useCurrentUser } from '@/contexts/AuthContext';

interface TenantRolesResult {
  /** Array of roles the user has in this tenant */
  roles: AppRole[];
  /** Check if user has a specific role */
  hasRole: (role: AppRole) => boolean;
  /** Check if user has any of the given roles */
  hasAnyRole: (roles: AppRole[]) => boolean;
  /** Check if user has all of the given roles */
  hasAllRoles: (roles: AppRole[]) => boolean;
  /** Whether the roles are still loading */
  isLoading: boolean;
  /** Error if any occurred during fetching */
  error: Error | null;
  /** Whether the query has completed (regardless of success/failure) */
  isFetched: boolean;
}

/**
 * Hook to get user roles for a specific tenant.
 * Uses React Query for caching.
 * 
 * @param tenantId - The tenant ID to check roles for
 * @returns TenantRolesResult with roles and helper functions
 */
export function useTenantRoles(tenantId: string | null | undefined): TenantRolesResult {
  const { currentUser, isAuthenticated } = useCurrentUser();

  const {
    data: roles = [],
    isLoading,
    error,
    isFetched,
  } = useQuery({
    queryKey: ['tenant-roles', currentUser?.id, tenantId],
    queryFn: async (): Promise<AppRole[]> => {
      if (!currentUser?.id || !tenantId) {
        return [];
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('useTenantRoles: Failed to fetch roles', error);
        throw error;
      }

      return (data || []).map(r => r.role as AppRole);
    },
    enabled: !!currentUser?.id && !!tenantId && isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes - roles don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes in cache
    retry: 1, // Only retry once on failure
    refetchOnWindowFocus: false, // Don't refetch on focus
  });

  const hasRole = (role: AppRole): boolean => {
    return roles.includes(role);
  };

  const hasAnyRole = (rolesToCheck: AppRole[]): boolean => {
    return rolesToCheck.some(role => roles.includes(role));
  };

  const hasAllRoles = (rolesToCheck: AppRole[]): boolean => {
    return rolesToCheck.every(role => roles.includes(role));
  };

  return {
    roles,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    isLoading,
    error: error as Error | null,
    isFetched,
  };
}

/**
 * Synchronous role checker for use outside of React components.
 * This fetches roles directly and should be used sparingly.
 * 
 * @param userId - User ID to check
 * @param tenantId - Tenant ID to check roles for
 * @returns Promise<AppRole[]> - Array of roles
 */
export async function fetchTenantRoles(
  userId: string,
  tenantId: string
): Promise<AppRole[]> {
  if (!userId || !tenantId) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('fetchTenantRoles: Failed to fetch roles', error);
    return []; // Deny by default on error
  }

  return (data || []).map(r => r.role as AppRole);
}
