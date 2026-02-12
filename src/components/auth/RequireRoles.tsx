/**
 * ============================================================================
 * 🔐 REQUIRE ROLES — Tenant-Scoped Role-Based Permission Guard
 * ============================================================================
 * 
 * CONTRACT:
 * This is the THIRD gate in the access hierarchy.
 * It validates that the user has the required roles for a tenant-scoped route.
 * 
 * HIERARCHY:
 * IdentityGate (auth) → TenantLayout (tenant context) → RequireRoles (permissions)
 * 
 * FOR GLOBAL ROUTES (/admin/*): Use RequireGlobalRoles instead.
 * 
 * SECURITY MODEL:
 * - FAIL-CLOSED: Missing roles show AccessDenied, not silent pass
 * - Strict useTenant() — throws if used outside TenantProvider
 * - Superadmin MUST have active impersonation for tenant routes
 * ============================================================================
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantRoles } from '@/hooks/useTenantRoles';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { AccessDenied } from './AccessDenied';
import { AppRole } from '@/types/auth';
import { logger } from '@/lib/logger';

interface RequireRolesProps {
  /** Roles that are allowed to access this route */
  allowed: AppRole[];
  /** Children to render if access is granted */
  children: React.ReactNode;
}

export function RequireRoles({ allowed, children }: RequireRolesProps) {
  // STRICT: useTenant() will throw if outside TenantProvider — by design
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { roles, isLoading: rolesLoading, isFetched } = useTenantRoles(tenant?.id);
  const { isImpersonating, impersonatedTenantId, isLoading: impersonationLoading } = useImpersonation();
  const { isGlobalSuperadmin } = useCurrentUser();
  const { t } = useI18n();

  const isLoading = tenantLoading || impersonationLoading || (!isFetched && rolesLoading);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.verifyingPermissions')}</p>
        </div>
      </div>
    );
  }

  const hasAllowedRole = allowed.some(role => roles.includes(role));
  
  const isSuperadminAccessingTenant = isGlobalSuperadmin && tenant;
  const hasValidImpersonation = isSuperadminAccessingTenant && isImpersonating && impersonatedTenantId === tenant.id;
  
  if (isSuperadminAccessingTenant && !hasValidImpersonation) {
    logger.warn('[REQUIRE_ROLES] Superadmin blocked - impersonation mismatch:', {
      isImpersonating,
      impersonatedTenantId,
      requiredTenantId: tenant?.id,
      mismatch: impersonatedTenantId !== tenant?.id,
    });
  }
  
  const hasAccess = hasValidImpersonation || hasAllowedRole;

  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

/**
 * Higher-order component version of RequireRoles.
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
