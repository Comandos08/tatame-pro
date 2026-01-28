/**
 * 🔐 RequireRoles — Role-Based Permission Guard
 * 
 * A permission guard that validates user roles ONLY.
 * Does NOT handle auth/redirect logic - that's IdentityGate's job.
 * 
 * RULES:
 * - NO Navigate - shows AccessDenied instead
 * - NO authLoading checks - IdentityGate handles that
 * - NO login/wizard decisions - IdentityGate handles that
 * - ONLY checks if user has required roles for this route
 * - Shows AccessDenied if not authorized
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantRoles } from '@/hooks/useTenantRoles';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { AccessDenied } from './AccessDenied';
import { AppRole } from '@/types/auth';

interface RequireRolesProps {
  /** Roles that are allowed to access this route */
  allowed: AppRole[];
  /** Children to render if access is granted */
  children: React.ReactNode;
}

/**
 * Permission guard that requires specific roles to render children.
 * Shows AccessDenied screen if user lacks required roles.
 * 
 * @example
 * <RequireRoles allowed={['ADMIN_TENANT', 'STAFF_ORGANIZACAO']}>
 *   <ApprovalDetails />
 * </RequireRoles>
 */
export function RequireRoles({ allowed, children }: RequireRolesProps) {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { roles, isLoading: rolesLoading, isFetched } = useTenantRoles(tenant?.id);
  const { isImpersonating, impersonatedTenantId, isLoading: impersonationLoading } = useImpersonation();
  const { isGlobalSuperadmin } = useCurrentUser();

  // Only show loader while fetching roles - NOT auth (IdentityGate handles that)
  const isLoading = tenantLoading || impersonationLoading || (!isFetched && rolesLoading);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Check if user has any of the allowed roles in this tenant
  const hasAllowedRole = allowed.some(role => roles.includes(role));
  
  // 🔐 SUPERADMIN IMPERSONATION LOGIC:
  // Superadmin accessing tenant routes MUST have active impersonation for that tenant
  const isSuperadminAccessingTenant = isGlobalSuperadmin && tenant;
  const hasValidImpersonation = isSuperadminAccessingTenant && isImpersonating && impersonatedTenantId === tenant.id;
  
  // Final access decision
  const hasAccess = hasValidImpersonation || hasAllowedRole;

  // 🔐 NO REDIRECT - Just show AccessDenied
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // ✅ Access granted
  return <>{children}</>;
}

/**
 * Higher-order component version of RequireRoles.
 * Useful for wrapping page components directly in routes.
 */
export function withRequireRoles<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  allowed: AppRole[]
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithRequireRoles = (props: P) => (
    <RequireRoles allowed={allowed}>
      <WrappedComponent {...props} />
    </RequireRoles>
  );

  WithRequireRoles.displayName = `withRequireRoles(${displayName})`;

  return WithRequireRoles;
}
