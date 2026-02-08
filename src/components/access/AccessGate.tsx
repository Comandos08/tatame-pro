/**
 * ============================================================================
 * 🔐 ACCESS GATE — Unified Access Boundary Component
 * ============================================================================
 * 
 * SAFE GOLD CONTRACT:
 * - Single gate that consumes the AccessResolver
 * - DOES NOT make independent decisions
 * - DOES NOT call Supabase directly
 * - DOES NOT chain other guards
 * 
 * This component is the canonical access boundary for protected routes.
 * It renders based on the AccessResult from useAccessResolver.
 * ============================================================================
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AlertCircle, RefreshCw, ShieldAlert, Lock, Clock, Home, LogOut } from 'lucide-react';
import { useAccessResolver } from '@/hooks/useAccessResolver';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';
import { IdentityLoadingScreen } from '@/components/identity/IdentityLoadingScreen';
import { AppRole } from '@/types/auth';
import type { AccessDeniedReason } from '@/lib/access/types';

interface AccessGateProps {
  /** Children to render when access is granted */
  children?: React.ReactNode;
  /** Required roles for this route (optional) */
  requiredRoles?: AppRole[];
}

/**
 * Maps denial reasons to i18n keys and icons
 */
const DENIAL_CONFIG: Record<AccessDeniedReason, {
  icon: typeof AlertCircle;
  iconVariant: 'destructive' | 'warning' | 'muted';
  titleKey: string;
  descriptionKey: string;
}> = {
  NOT_AUTHENTICATED: {
    icon: Lock,
    iconVariant: 'muted',
    titleKey: 'access.notAuthenticated',
    descriptionKey: 'access.notAuthenticatedDesc',
  },
  TENANT_REQUIRED: {
    icon: AlertCircle,
    iconVariant: 'warning',
    titleKey: 'access.tenantRequired',
    descriptionKey: 'access.tenantRequiredDesc',
  },
  TENANT_NOT_FOUND: {
    icon: AlertCircle,
    iconVariant: 'destructive',
    titleKey: 'tenant.notFound',
    descriptionKey: 'tenant.notFoundDesc',
  },
  TENANT_BLOCKED: {
    icon: ShieldAlert,
    iconVariant: 'destructive',
    titleKey: 'access.tenantBlocked',
    descriptionKey: 'access.tenantBlockedDesc',
  },
  ROLE_DENIED: {
    icon: Lock,
    iconVariant: 'warning',
    titleKey: 'access.roleDenied',
    descriptionKey: 'access.roleDeniedDesc',
  },
  BILLING_BLOCKED: {
    icon: AlertCircle,
    iconVariant: 'destructive',
    titleKey: 'access.billingBlocked',
    descriptionKey: 'access.billingBlockedDesc',
  },
  WIZARD_REQUIRED: {
    icon: AlertCircle,
    iconVariant: 'muted',
    titleKey: 'access.wizardRequired',
    descriptionKey: 'access.wizardRequiredDesc',
  },
  IMPERSONATION_REQUIRED: {
    icon: ShieldAlert,
    iconVariant: 'warning',
    titleKey: 'impersonation.actionRequired',
    descriptionKey: 'impersonation.superadminContextRequired',
  },
  ONBOARDING_REQUIRED: {
    icon: AlertCircle,
    iconVariant: 'muted',
    titleKey: 'access.onboardingRequired',
    descriptionKey: 'access.onboardingRequiredDesc',
  },
  TIMEOUT: {
    icon: Clock,
    iconVariant: 'warning',
    titleKey: 'access.timeout',
    descriptionKey: 'access.timeoutDesc',
  },
  UNKNOWN_ERROR: {
    icon: AlertCircle,
    iconVariant: 'destructive',
    titleKey: 'access.unknownError',
    descriptionKey: 'access.unknownErrorDesc',
  },
};

/**
 * Unified access boundary component.
 * 
 * @example
 * // In router:
 * <Route element={<AccessGate />}>
 *   <Route path="dashboard" element={<Dashboard />} />
 * </Route>
 * 
 * // With required roles:
 * <Route element={<AccessGate requiredRoles={['ADMIN_TENANT']} />}>
 *   <Route path="settings" element={<Settings />} />
 * </Route>
 */
export function AccessGate({ children, requiredRoles }: AccessGateProps) {
  const { access, retry } = useAccessResolver({ requiredRoles });
  const { signOut } = useCurrentUser();
  const { t } = useI18n();

  // =========================================================================
  // LOADING State
  // =========================================================================
  if (access.state === 'LOADING') {
    return (
      <IdentityLoadingScreen 
        onRetry={retry} 
        onLogout={() => signOut()} 
      />
    );
  }

  // =========================================================================
  // DENIED State
  // =========================================================================
  if (access.state === 'DENIED') {
    // SAFE GOLD: Navigation is AccessGate's responsibility, not resolver's
    // Map denial reasons to redirects
    const REDIRECT_MAP: Partial<Record<AccessDeniedReason, string>> = {
      NOT_AUTHENTICATED: '/login',
      WIZARD_REQUIRED: '/identity/wizard',
      IMPERSONATION_REQUIRED: '/admin',
    };
    
    const redirectTo = REDIRECT_MAP[access.reason];
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    
    // SAFE GOLD: Fallback to UNKNOWN_ERROR config if reason not mapped
    const config = DENIAL_CONFIG[access.reason] ?? DENIAL_CONFIG.UNKNOWN_ERROR;
    
    return (
      <BlockedStateCard
        icon={config.icon}
        iconVariant={config.iconVariant}
        titleKey={config.titleKey}
        descriptionKey={config.descriptionKey}
        actions={[
          {
            labelKey: 'common.goHome',
            onClick: () => window.location.href = '/',
            icon: Home,
          },
          {
            labelKey: 'auth.logout',
            onClick: () => signOut(),
            icon: LogOut,
          },
        ]}
      />
    );
  }

  // =========================================================================
  // ERROR State
  // =========================================================================
  if (access.state === 'ERROR') {
    // SAFE GOLD: Fallback to UNKNOWN_ERROR config if reason not mapped
    const config = DENIAL_CONFIG[access.reason] ?? DENIAL_CONFIG.UNKNOWN_ERROR;
    
    // debugCode is for auditing only, never shown in UI
    // Could be logged here in the future: console.debug('[AccessGate] debugCode:', access.debugCode);
    
    return (
      <BlockedStateCard
        icon={config.icon}
        iconVariant={config.iconVariant}
        titleKey={config.titleKey}
        descriptionKey={config.descriptionKey}
        hintKey={access.error}
        actions={[
          {
            labelKey: 'common.retry',
            onClick: retry,
            icon: RefreshCw,
          },
          {
            labelKey: 'auth.logout',
            onClick: () => signOut(),
            icon: LogOut,
          },
        ]}
      />
    );
  }

  // =========================================================================
  // ALLOWED State
  // =========================================================================
  return children ? <>{children}</> : <Outlet />;
}

export default AccessGate;
