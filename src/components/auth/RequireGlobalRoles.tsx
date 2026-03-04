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
 * - Profile-loading race condition handled with timeout fallback
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { AccessDenied } from './AccessDenied';
import { AppRole } from '@/types/auth';
import { logger } from '@/lib/logger';

const PROFILE_LOAD_TIMEOUT_MS = 5000;

interface RequireGlobalRolesProps {
  allowed: AppRole[];
  children: React.ReactNode;
}

export function RequireGlobalRoles({ allowed, children }: RequireGlobalRolesProps) {
  const { currentUser, isLoading, isAuthenticated, isGlobalSuperadmin, signOut } = useCurrentUser();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // TIMEOUT: If profile doesn't load within 5s, force logout
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isAuthenticated || currentUser || isLoading) {
      setTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      logger.warn('[RequireGlobalRoles] Profile load timeout after 5s — forcing logout', {
        perfNow: performance.now(),
        timestamp: new Date().toISOString(),
      });
      setTimedOut(true);
      signOut().then(() => navigate('/login', { replace: true }));
    }, PROFILE_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isAuthenticated, currentUser, isLoading, signOut, navigate]);

  // Phase 1: Auth bootstrap loading
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

  // Phase 2: Session exists but profile still loading (race condition fix)
  if (isAuthenticated && !currentUser && !timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loadingProfile')}</p>
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
    return false;
  });

  if (!hasAccess) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
