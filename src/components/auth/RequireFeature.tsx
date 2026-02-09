/**
 * 🔐 RequireFeature — Backend Contract Route Guard
 * 
 * PI A3: This guard does NOT decide rules.
 * It only applies the result of the backend contract (feature_access table).
 * 
 * FAIL-CLOSED:
 * - Loading → skeleton (no content rendered)
 * - Error → AccessDenied
 * - Feature not allowed → AccessDenied
 * 
 * HIERARCHY:
 * IdentityGate (auth) → TenantLayout (tenant) → RequireFeature (permission)
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useAccessContract } from '@/hooks/useAccessContract';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { AccessDenied } from './AccessDenied';

interface RequireFeatureProps {
  /** The feature key to check against the backend contract */
  featureKey: string;
  /** Children to render if access is granted */
  children: React.ReactNode;
}

export function RequireFeature({ featureKey, children }: RequireFeatureProps) {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { can, isLoading: contractLoading, isError } = useAccessContract(tenant?.id);
  const { isImpersonating, impersonatedTenantId, isLoading: impersonationLoading } = useImpersonation();
  const { isGlobalSuperadmin } = useCurrentUser();
  const { t } = useI18n();

  // STEP 1: Loading → skeleton (fail-closed)
  const isLoading = tenantLoading || impersonationLoading || contractLoading;
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

  // STEP 2: Error → deny
  if (isError) {
    return <AccessDenied />;
  }

  // STEP 3: Superadmin impersonation check
  const isSuperadminWithImpersonation =
    isGlobalSuperadmin &&
    tenant &&
    isImpersonating &&
    impersonatedTenantId === tenant.id;

  // STEP 4: Access decision (backend contract OR valid impersonation)
  const hasAccess = isSuperadminWithImpersonation || can(featureKey);

  if (!hasAccess) {
    return <AccessDenied />;
  }

  // STEP 5: Access granted
  return <>{children}</>;
}
