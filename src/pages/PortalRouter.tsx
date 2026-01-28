/**
 * 🔐 PORTAL ROUTER — Deterministic Redirect Hub
 *
 * F0.2.1 CONTRACT-COMPLIANT:
 * - NO client-side DB queries
 * - Uses ONLY identityState + redirectPath from IdentityContext
 * - Deterministic navigation via <Navigate>
 * 
 * ROUTING RULES:
 * 1. Loading → Loader
 * 2. !auth → /login
 * 3. wizard_required → /identity/wizard
 * 4. superadmin → /admin
 * 5. resolved + redirectPath → Navigate to redirectPath
 * 6. resolved + no redirectPath → Error
 * 7. error → Error
 */

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalRouter() {
  const { t } = useI18n();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading, signOut } = useCurrentUser();
  const { identityState, redirectPath, error, refreshIdentity } = useIdentity();

  // ===== 1. Loading state =====
  if (authLoading || identityState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // ===== 2. Not authenticated → /login =====
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // ===== 3. Wizard required → /identity/wizard =====
  if (identityState === 'wizard_required') {
    return <Navigate to="/identity/wizard" replace />;
  }

  // ===== 4. Superadmin → /admin =====
  if (identityState === 'superadmin') {
    return <Navigate to="/admin" replace />;
  }

  // ===== 5. Resolved + redirectPath → Navigate =====
  if (identityState === 'resolved' && redirectPath) {
    // Prevent loop: don't redirect to self
    if (location.pathname === redirectPath) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{t("portal.redirecting")}</p>
          </div>
        </div>
      );
    }
    return <Navigate to={redirectPath} replace />;
  }

  // ===== 6. Resolved + no redirectPath → Error =====
  if (identityState === 'resolved' && !redirectPath) {
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

  // ===== 7. Error state =====
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

  // Fallback: show loading (shouldn't reach here)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t("portal.resolvingDestination")}</p>
      </div>
    </div>
  );
}
