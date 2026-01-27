/**
 * 🔐 RequireRoles — Role-Based Route Guard with Impersonation Support
 * 
 * A generic guard component that protects routes based on user roles.
 * 
 * RULES:
 * - If not authenticated → redirect to /portal
 * - If no allowed roles → redirect to /portal
 * - If superadmin accessing tenant routes → require impersonation
 * - /portal is the ONLY decision hub (never redirect to /login directly)
 * - Deny by default
 * - Loading state renders loader, never children
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantRoles } from '@/hooks/useTenantRoles';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { AppRole } from '@/types/auth';

interface RequireRolesProps {
  /** Roles that are allowed to access this route */
  allowed: AppRole[];
  /** Whether a tenant context is required (default: true) */
  tenantRequired?: boolean;
  /** Children to render if access is granted */
  children: React.ReactNode;
  /** Custom redirect path (default: /portal) */
  redirectTo?: string;
}

/**
 * Guard component that requires specific roles to render children.
 * 
 * @example
 * <RequireRoles allowed={['ADMIN_TENANT', 'STAFF_ORGANIZACAO']}>
 *   <ApprovalDetails />
 * </RequireRoles>
 */
export function RequireRoles({
  allowed,
  tenantRequired = true,
  children,
  redirectTo = '/portal',
}: RequireRolesProps) {
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { currentUser, isAuthenticated, isLoading: authLoading, isGlobalSuperadmin } = useCurrentUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { roles, isLoading: rolesLoading, isFetched } = useTenantRoles(tenant?.id);
  const { isImpersonating, impersonatedTenantId, isLoading: impersonationLoading } = useImpersonation();

  // Prevent multiple redirects
  const hasRedirected = useRef(false);

  // Calculate access
  const isLoading = authLoading || impersonationLoading || (tenantRequired && tenantLoading) || (tenantRequired && !isFetched && rolesLoading);
  
  // Check if user has any of the allowed roles in this tenant
  const hasAllowedRole = allowed.some(role => roles.includes(role));
  
  // 🔐 SUPERADMIN IMPERSONATION LOGIC:
  // - If accessing /admin routes (SUPERADMIN_GLOBAL role), no impersonation needed
  // - If accessing tenant routes as superadmin, MUST have active impersonation for that tenant
  const isSuperadminAccessingAdmin = isGlobalSuperadmin && allowed.includes('SUPERADMIN_GLOBAL') && !tenantRequired;
  
  const isSuperadminAccessingTenant = isGlobalSuperadmin && tenantRequired && tenant;
  const hasValidImpersonation = isSuperadminAccessingTenant && isImpersonating && impersonatedTenantId === tenant.id;
  
  // Final access decision
  const hasAccess = 
    isSuperadminAccessingAdmin || // Superadmin accessing /admin
    hasValidImpersonation ||       // Superadmin with valid impersonation for this tenant
    hasAllowedRole;                // User has required role for this tenant

  useEffect(() => {
    // Wait for loading to complete
    if (isLoading || hasRedirected.current) {
      return;
    }

    // 🔐 Rule 1: Not authenticated → /portal
    if (!isAuthenticated || !currentUser) {
      hasRedirected.current = true;
      navigate(redirectTo, { replace: true });
      return;
    }

    // 🔐 Rule 2: Tenant required but not loaded → wait (handled by isLoading)
    if (tenantRequired && !tenant) {
      // Tenant not found after loading - redirect to /portal
      if (!tenantLoading) {
        hasRedirected.current = true;
        navigate(redirectTo, { replace: true });
      }
      return;
    }

    // 🔐 Rule 3: Superadmin accessing tenant without impersonation → /admin
    if (isSuperadminAccessingTenant && !hasValidImpersonation && !hasAllowedRole) {
      hasRedirected.current = true;
      console.warn(
        `RequireRoles: Superadmin ${currentUser.id} attempted to access tenant ${tenant?.slug} without impersonation. ` +
        `Redirecting to /admin`
      );
      navigate('/admin', { replace: true });
      return;
    }

    // 🔐 Rule 4: No allowed role → /portal
    if (!hasAccess) {
      hasRedirected.current = true;
      console.warn(
        `RequireRoles: Access denied for user ${currentUser.id}. ` +
        `Required: [${allowed.join(', ')}], Has: [${roles.join(', ')}]. ` +
        `Redirecting to ${redirectTo}`
      );
      navigate(redirectTo, { replace: true });
      return;
    }
  }, [
    isLoading,
    isAuthenticated,
    currentUser,
    tenant,
    tenantLoading,
    tenantRequired,
    hasAccess,
    hasAllowedRole,
    hasValidImpersonation,
    isSuperadminAccessingTenant,
    allowed,
    roles,
    navigate,
    redirectTo,
  ]);

  // Loading state
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

  // Not authenticated - show nothing while redirecting
  if (!isAuthenticated || !currentUser) {
    return null;
  }

  // Tenant required but not available
  if (tenantRequired && !tenant) {
    return null;
  }

  // No access - show nothing while redirecting
  if (!hasAccess) {
    return null;
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
  allowed: AppRole[],
  options?: { tenantRequired?: boolean; redirectTo?: string }
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithRequireRoles = (props: P) => (
    <RequireRoles allowed={allowed} {...options}>
      <WrappedComponent {...props} />
    </RequireRoles>
  );

  WithRequireRoles.displayName = `withRequireRoles(${displayName})`;

  return WithRequireRoles;
}
