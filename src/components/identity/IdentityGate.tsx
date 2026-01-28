/**
 * 🔐 IDENTITY GATE — Single Canonical Router/Guard
 * 
 * F0.2.1 CONTRACT-COMPLIANT:
 * - Routes ONLY based on backend state (IdentityContext)
 * - NO client-side DB queries
 * - NO heuristic-based routing
 * - Uses <Navigate> instead of useEffect navigate
 * - NO superadmin bypass
 * 
 * ROUTING RULES (deterministic):
 * R1. authLoading OR identityState='loading' → Loader
 * R2. !isAuthenticated → <Navigate to="/login" />
 * R3. identityState='wizard_required' → <Navigate to="/identity/wizard" />
 * R4. identityState='superadmin' → <Navigate to="/admin" /> (NO bypass)
 * R5. identityState='resolved' → <Navigate to={redirectPath} />
 * R6. identityState='error' → Error screen
 */

import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useIdentity } from '@/contexts/IdentityContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';

interface IdentityGateProps {
  children: ReactNode;
}

/**
 * Canonical gate that enforces identity resolution before rendering protected content.
 * Uses ONLY backend state - no client-side DB queries.
 */
export function IdentityGate({ children }: IdentityGateProps) {
  const location = useLocation();
  const { t } = useI18n();
  const { isAuthenticated, isLoading: authLoading, signOut } = useCurrentUser();
  const { 
    identityState, 
    redirectPath, 
    error, 
    refreshIdentity 
  } = useIdentity();

  const pathname = location.pathname;

  // ===== R1: Loading state =====
  if (authLoading || identityState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // ===== R2: Not authenticated → /login =====
  if (!isAuthenticated) {
    if (pathname === '/login') {
      return <React.Fragment>{children}</React.Fragment>;
    }
    return <Navigate to="/login" replace />;
  }

  // ===== R3: Wizard required → /identity/wizard =====
  if (identityState === 'wizard_required') {
    if (pathname === '/identity/wizard') {
      return <React.Fragment>{children}</React.Fragment>;
    }
    return <Navigate to="/identity/wizard" replace />;
  }

  // ===== R4: Superadmin → /admin (NO bypass) =====
  if (identityState === 'superadmin') {
    if (pathname.startsWith('/admin')) {
      return <React.Fragment>{children}</React.Fragment>;
    }
    return <Navigate to="/admin" replace />;
  }

  // ===== R5: Resolved → redirectPath =====
  if (identityState === 'resolved') {
    // No redirect path = error state
    if (!redirectPath) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <CardTitle className="text-center">{t('identity.noContext')}</CardTitle>
              <CardDescription className="text-center">
                {t('identity.noContextDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={refreshIdentity} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('common.retry')}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => signOut()} 
                className="w-full"
              >
                {t('auth.logout')}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // On /portal → redirect to redirectPath
    if (pathname === '/portal' && redirectPath !== '/portal') {
      return <Navigate to={redirectPath} replace />;
    }

    // Already on redirectPath or any valid route → render children
    return <React.Fragment>{children}</React.Fragment>;
  }

  // ===== R6: Error state =====
  if (identityState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <CardTitle className="text-center">{t('identity.error')}</CardTitle>
            <CardDescription className="text-center">
              {error?.message || t('identity.unknownError')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={refreshIdentity} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.retry')}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => signOut()} 
              className="w-full"
            >
              {t('auth.logout')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback: render children (shouldn't reach here with proper state)
  return <React.Fragment>{children}</React.Fragment>;
}

export default IdentityGate;
