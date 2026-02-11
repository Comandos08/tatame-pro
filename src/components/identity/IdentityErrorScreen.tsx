/**
 * 🔐 IDENTITY ERROR SCREEN — Explicit Error Display
 * 
 * P1.1: Refactored to use BlockedStateCard for unified UX.
 * Shows clear, actionable error messages for identity issues.
 * No silent errors, no console-only logging.
 * 
 * All strings now use i18n keys (no hardcoded text).
 */

import { useNavigate } from 'react-router-dom';
import { Building2, Key, Shield, HelpCircle } from 'lucide-react';
import { BlockedStateCard, type BlockedStateAction } from '@/components/ux/BlockedStateCard';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useIdentity, IdentityError } from '@/contexts/IdentityContext';
import type { LucideIcon } from 'lucide-react';

interface IdentityErrorScreenProps {
  error: IdentityError;
}

interface ErrorConfig {
  icon: LucideIcon;
  iconVariant: 'destructive' | 'warning' | 'muted';
  titleKey: string;
  descriptionKey: string;
  actions: BlockedStateAction[];
}

export function IdentityErrorScreen({ error }: IdentityErrorScreenProps) {
  const navigate = useNavigate();
  const { signOut } = useCurrentUser();
  const { clearError } = useIdentity();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleRetry = () => {
    clearError();
  };

  const handleGoToWizard = () => {
    clearError();
    navigate('/identity/wizard', { replace: true });
  };

  const handleGoHome = () => {
    navigate('/', { replace: true });
  };

  const handleContactSupport = () => {
    navigate('/help', { replace: true });
  };

  const getErrorConfig = (): ErrorConfig => {
    switch (error.code) {
      case 'TENANT_NOT_FOUND':
        return {
          icon: Building2,
          iconVariant: 'destructive',
          titleKey: 'identityError.tenantNotFound.title',
          descriptionKey: 'identityError.tenantNotFound.desc',
          actions: [
            { labelKey: 'identityError.tenantNotFound.selectOrg', onClick: handleGoToWizard },
            { labelKey: 'common.goHome', onClick: handleGoHome },
            { labelKey: 'auth.logout', onClick: handleLogout },
          ],
        };

      case 'INVITE_INVALID':
        return {
          icon: Key,
          iconVariant: 'warning',
          titleKey: 'identityError.inviteInvalid.title',
          descriptionKey: 'identityError.inviteInvalid.desc',
          actions: [
            { labelKey: 'common.retry', onClick: handleGoToWizard },
            { labelKey: 'common.contactSupport', onClick: handleContactSupport },
            { labelKey: 'auth.logout', onClick: handleLogout },
          ],
        };

      case 'PERMISSION_DENIED':
        return {
          icon: Shield,
          iconVariant: 'destructive',
          titleKey: 'identityError.permissionDenied.title',
          descriptionKey: 'identityError.permissionDenied.desc',
          actions: [
            { labelKey: 'common.contactSupport', onClick: handleContactSupport },
            { labelKey: 'common.goHome', onClick: handleGoHome },
            { labelKey: 'auth.logout', onClick: handleLogout },
          ],
        };

      case 'IMPERSONATION_INVALID':
        return {
          icon: Shield,
          iconVariant: 'warning',
          titleKey: 'identityError.impersonationInvalid.title',
          descriptionKey: 'identityError.impersonationInvalid.desc',
          actions: [
            { labelKey: 'identityError.impersonationInvalid.backToAdmin', onClick: () => navigate('/admin', { replace: true }) },
            { labelKey: 'auth.logout', onClick: handleLogout },
          ],
        };

      default:
        return {
          icon: HelpCircle,
          iconVariant: 'muted',
          titleKey: 'identityError.default.title',
          descriptionKey: 'identityError.default.desc',
          actions: [
            { labelKey: 'common.retry', onClick: handleRetry },
            { labelKey: 'common.contactSupport', onClick: handleContactSupport },
            { labelKey: 'auth.logout', onClick: handleLogout },
          ],
        };
    }
  };

  const config = getErrorConfig();

  return (
    <BlockedStateCard
      icon={config.icon}
      iconVariant={config.iconVariant}
      titleKey={config.titleKey}
      descriptionKey={config.descriptionKey}
      actions={config.actions}
    />
  );
}

/**
 * Standalone error page for direct navigation
 */
export function IdentityErrorPage() {
  const { error } = useIdentity();
  
  if (!error) {
    return (
      <IdentityErrorScreen 
        error={{ code: 'UNKNOWN', message: 'Unknown error' }} 
      />
    );
  }

  return <IdentityErrorScreen error={error} />;
}
