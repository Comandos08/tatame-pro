/**
 * ============================================================================
 * 🔐 REQUIRE GLOBAL ROLES — Global Route Permission Guard
 * ============================================================================
 * 
 * CONTRACT:
 * Guards global routes (e.g., /admin) that have NO tenant context.
 * Validates roles using AuthContext only — never touches TenantProvider.
 * 
 * USE THIS for: /admin, /admin/health, /admin/audit, etc.
 * USE RequireRoles for: /:tenantSlug/app/* (tenant-scoped routes)
 * 
 * SECURITY MODEL:
 * - FAIL-CLOSED: Missing roles show AccessDenied
 * - No tenant dependency — structurally impossible to leak tenant data
 * ============================================================================
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { AccessDenied } from './AccessDenied';
import { AppRole } from '@/types/auth';

interface RequireGlobalRolesProps {
  allowed: AppRole[];
  children: React.ReactNode;
}

export function RequireGlobalRoles({ allowed, children }: RequireGlobalRolesProps) {
  const { currentUser, isLoading, isGlobalSuperadmin } = useCurrentUser();
  const { t } = useI18n();

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

  // FAIL-CLOSED: No user = no access
  if (!currentUser) {
    return <AccessDenied />;
  }

  // Check global roles from AuthContext
  const hasAccess = allowed.some(role => {
    if (role === 'SUPERADMIN_GLOBAL') return isGlobalSuperadmin;
    // For global routes, only SUPERADMIN_GLOBAL is valid
    return false;
  });

  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
