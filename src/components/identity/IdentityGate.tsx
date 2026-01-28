/**
 * 🔐 IDENTITY GATE — Single Canonical Router/Guard
 * 
 * F0.2 CONTRACT-COMPLIANT:
 * - Routes ONLY based on backend state (IdentityContext)
 * - NO client-side DB queries
 * - NO heuristic-based routing
 * - Uses <Navigate> instead of useEffect navigate
 * 
 * ROUTING RULES (deterministic):
 * 1. authLoading OR identityState='loading' → Loader
 * 2. !isAuthenticated → <Navigate to="/login" />
 * 3. identityState='wizard_required' → <Navigate to="/identity/wizard" />
 * 4. identityState='superadmin' → <Navigate to="/admin" />
 * 5. identityState='resolved' → <Navigate to={redirectPath} />
 * 6. identityState='error' → Error screen
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

  // ===== RULE 1: Loading state =====
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

  // ===== RULE 2: Not authenticated → /login =====
  if (!isAuthenticated) {
    // Already on login, don't redirect
    if (pathname === '/login') {
      return <>{children}</>;
    }
    return <Navigate to="/login" replace />;
  }

  // ===== RULE 3: Wizard required → /identity/wizard =====
  if (identityState === 'wizard_required') {
    // Already on wizard, render children
    if (pathname === '/identity/wizard') {
      return <>{children}</>;
    }
    return <Navigate to="/identity/wizard" replace />;
  }

  // ===== RULE 4: Superadmin → /admin =====
  if (identityState === 'superadmin') {
    // Already on admin routes, render children
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return <>{children}</>;
    }
    // Allow superadmin to access tenant routes via impersonation
    // But if they hit /portal or protected routes without context, go to /admin
    if (pathname === '/portal') {
      return <Navigate to="/admin" replace />;
    }
    // Otherwise render children (they might be impersonating)
    return <>{children}</>;
  }

  // ===== RULE 5: Resolved → redirectPath =====
  if (identityState === 'resolved') {
    // If we have a redirect path and we're on /portal, navigate there
    if (pathname === '/portal' && redirectPath) {
      return <Navigate to={redirectPath} replace />;
    }
    
    // If no redirect path and on /portal, show error (shouldn't happen)
    if (pathname === '/portal' && !redirectPath) {
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

    // On any other route, render children (route guards will handle specifics)
    return <>{children}</>;
  }

  // ===== RULE 6: Error state =====
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

  // Fallback: render children
  return <>{children}</>;
}

export default IdentityGate;
