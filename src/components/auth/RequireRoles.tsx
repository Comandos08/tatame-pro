/**
 * ============================================================================
 * 🔐 REQUIRE ROLES — Role-Based Permission Guard
 * ============================================================================
 * 
 * CONTRACT:
 * This is the THIRD gate in the access hierarchy.
 * It validates that the user has the required roles for a specific route.
 * 
 * HIERARCHY:
 * IdentityGate (auth) → TenantLayout (tenant context) → RequireRoles (permissions)
 * 
 * RESPONSIBILITIES (what this gate DOES):
 * ✔️ Validates user has at least one of the allowed roles
 * ✔️ Handles superadmin impersonation access logic
 * ✔️ Shows AccessDenied screen if unauthorized
 * 
 * BOUNDARIES (what this gate DOES NOT do):
 * ❌ DOES NOT validate authentication — IdentityGate handles this
 * ❌ DOES NOT resolve tenant context — TenantLayout handles this
 * ❌ DOES NOT redirect to login — IdentityGate handles this
 * ❌ DOES NOT redirect to wizard — IdentityGate handles this
 * ❌ DOES NOT validate billing status — TenantLayout handles this
 * 
 * SECURITY MODEL:
 * - FAIL-CLOSED: Missing roles show AccessDenied, not silent pass
 * - NO Navigate: Never redirects, always shows denial screen
 * - Superadmin MUST have active impersonation for tenant routes
 * 
 * ASSUMES:
 * - User is already authenticated (IdentityGate ran first)
 * - Tenant context is already resolved (TenantLayout ran first)
 * ============================================================================
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTenantOptional } from '@/contexts/TenantContext';
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

/**
 * Permission guard that requires specific roles to render children.
 * Shows AccessDenied screen if user lacks required roles.
 * 
 * @example
 * <RequireRoles allowed={['ADMIN_TENANT']}>
 *   <ApprovalDetails />
 * </RequireRoles>
 */
// =============================================================================
// REQUIRE ROLES COMPONENT
// =============================================================================

export function RequireRoles({ allowed, children }: RequireRolesProps) {
  // =========================================================================
  // STEP 1: Hook Initialization
  // =========================================================================
  // BY DESIGN: All hooks called unconditionally (React rules)
  const tenantCtx = useTenantOptional();
  const tenant = tenantCtx?.tenant ?? null;
  const tenantLoading = tenantCtx?.isLoading ?? false;
  const { roles, isLoading: rolesLoading, isFetched } = useTenantRoles(tenant?.id);
  const { isImpersonating, impersonatedTenantId, isLoading: impersonationLoading } = useImpersonation();
  const { isGlobalSuperadmin } = useCurrentUser();
  const { t } = useI18n();

  // =========================================================================
  // STEP 2: Loading State
  // =========================================================================
  // BY DESIGN: Only show loader while fetching roles
  // DOES NOT check auth loading — IdentityGate handles that
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

  // =========================================================================
  // STEP 3: Role Evaluation
  // =========================================================================
  // BY DESIGN: Check if user has at least one of the allowed roles
  const hasAllowedRole = allowed.some(role => roles.includes(role));
  
  // =========================================================================
  // STEP 4: Superadmin Impersonation Logic
  // =========================================================================
  // SECURITY BOUNDARY: Superadmin accessing tenant routes MUST have active impersonation
  // BY DESIGN: This prevents superadmin from accidentally accessing tenant data without context
  // INTENTIONAL: Impersonation must match the current tenant exactly
  const isSuperadminAccessingTenant = isGlobalSuperadmin && tenant;
  const hasValidImpersonation = isSuperadminAccessingTenant && isImpersonating && impersonatedTenantId === tenant.id;
  
  // DIAGNOSTIC LOG: Debug impersonation issues (P0 - Safe Mode)
  // BY DESIGN: Warn-only, does not affect behavior
  if (isSuperadminAccessingTenant && !hasValidImpersonation) {
    logger.warn('[REQUIRE_ROLES] Superadmin blocked - impersonation mismatch:', {
      isImpersonating,
      impersonatedTenantId,
      requiredTenantId: tenant?.id,
      mismatch: impersonatedTenantId !== tenant?.id,
    });
  }
  
  // =========================================================================
  // STEP 5: Final Access Decision
  // =========================================================================
  // BY DESIGN: Access granted if user has valid impersonation OR allowed role
  // INTENTIONAL: Impersonation takes precedence (superadmin acting as tenant admin)
  const hasAccess = hasValidImpersonation || hasAllowedRole;

  // =========================================================================
  // STEP 6: Access Denied Rendering
  // =========================================================================
  // FAIL-CLOSED: No redirect — show AccessDenied screen
  // BY DESIGN: This gate NEVER redirects, it only blocks or allows
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // =========================================================================
  // STEP 7: Access Granted
  // =========================================================================
  // ✅ SUCCESS: Render protected content
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
