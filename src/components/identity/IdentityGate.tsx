/**
 * 🔐 IDENTITY GATE — Single Canonical Router/Guard
 *
 * P2 REFACTOR: All identity decisions delegated to identity-state-machine.
 * This component ONLY:
 * 1. Constructs IdentityResolutionInput from hooks
 * 2. Calls resolveIdentityState() ONCE
 * 3. Calls resolveIdentityRedirect() for navigation
 * 4. Renders UI based on state
 *
 * P0 PRODUCT SAFETY:
 * - Uses IdentityLoadingScreen for UX-only timeout feedback (8s)
 * - Actual hard timeout (12s) is in IdentityContext
 * - All error states have explicit escape hatch via resolveErrorEscapeHatch
 */

import React, { useRef, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useIdentity } from "@/contexts/IdentityContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { IdentityLoadingScreen } from "./IdentityLoadingScreen";
import {
  resolveIdentityState,
  IdentityResolutionInput,
  resolveIdentityRedirect,
  resolveErrorEscapeHatch,
  observeIdentityTransition,
  devLogIdentityObservation,
  emitIdentityTelemetry,
  type IdentityState,
} from "@/lib/identity";

interface IdentityGateProps {
  children: React.ReactNode;
}

/**
 * Rotas globais reservadas (não são slugs de tenant).
 */
const RESERVED_ROUTE_SEGMENTS = new Set([
  "admin",
  "portal",
  "login",
  "auth",
  "identity",
  "help",
  "forgot-password",
  "reset-password",
]);

/**
 * Detecta estruturalmente se uma rota é de tenant (/:tenantSlug/*).
 */
function isTenantRoute(pathname: string): { isTenant: boolean; tenantSlug: string | null } {
  const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean);

  if (segments.length === 0) {
    return { isTenant: false, tenantSlug: null };
  }

  const firstSegment = segments[0].toLowerCase();

  if (RESERVED_ROUTE_SEGMENTS.has(firstSegment)) {
    return { isTenant: false, tenantSlug: null };
  }

  return { isTenant: true, tenantSlug: segments[0] };
}

/**
 * Public path rules - bypass auth/identity checks completely.
 */
function isPublicPath(pathname: string) {
  const rootPublic = new Set([
    "/",
    "/about",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/help",
    "/auth/callback",
    "/identity/wizard",
    "/identity/error",
  ]);
  if (rootPublic.has(pathname)) return true;

  const tenantPublicPatterns: RegExp[] = [
    /^\/[^/]+\/?$/,
    /^\/[^/]+\/login\/?$/,
    /^\/[^/]+\/verify\/?.*$/,
    /^\/[^/]+\/academies\/?$/,
    /^\/[^/]+\/rankings\/?$/,
    /^\/[^/]+\/events\/?$/,
    /^\/[^/]+\/events\/[^/]+\/?$/,
    /^\/[^/]+\/membership\/?.*$/,
  ];

  return tenantPublicPatterns.some((re) => re.test(pathname));
}

/**
 * Canonical gate that enforces identity resolution before rendering protected content.
 * Uses ONLY backend state - no client-side DB queries.
 */
export function IdentityGate({ children }: IdentityGateProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  // ✅ ALL HOOKS MUST BE CALLED UNCONDITIONALLY (React rules)
  const { t } = useI18n();
  const { isAuthenticated, isLoading: authLoading, signOut } = useCurrentUser();
  const { identityState: backendStatus, redirectPath, error, refreshIdentity } = useIdentity();
  const { isImpersonating, session: impersonationSession, resolutionStatus } = useImpersonation();

  // ===== P3: DEV-ONLY OBSERVABILITY (hooks must be unconditional) =====
  const prevStateRef = useRef<IdentityState | null>(null);
  const isPublic = isPublicPath(pathname);

  // Compute state even for public paths (needed for observability hook)
  const input: IdentityResolutionInput = {
    isAuthenticated,
    isAuthLoading: authLoading,
    backendStatus,
    hasError: !!error,
  };

  const resolvedState = resolveIdentityState(input);

  const redirectDecision = resolveIdentityRedirect(resolvedState, {
    currentPath: pathname,
    redirectPath,
    isImpersonating,
    impersonationTenantSlug: impersonationSession?.targetTenantSlug,
  });

  useEffect(() => {
    // Skip observability for public paths
    if (isPublic) return;

    const { event, violations } = observeIdentityTransition({
      from: prevStateRef.current,
      to: resolvedState,
      pathname,
      decision: redirectDecision,
      context: {
        redirectPath,
        isImpersonating,
        impersonationTenantSlug: impersonationSession?.targetTenantSlug,
      },
    });

    devLogIdentityObservation({ event, violations });
    prevStateRef.current = resolvedState;
  }, [resolvedState, pathname, isPublic]);

  // ===== P4: PRODUCTION TELEMETRY (fire-and-forget) =====
  useEffect(() => {
    // Skip for public paths (no identity resolution needed)
    if (isPublic) return;
    
    // Skip LOADING state (transitional, not actionable)
    if (resolvedState === 'LOADING') return;

    // Base event: state resolved
    emitIdentityTelemetry({
      event: 'identity.state_resolved',
      state: resolvedState,
      pathname,
      timestamp: new Date().toISOString(),
    });

    // Specific events by state
    if (resolvedState === 'WIZARD_REQUIRED') {
      emitIdentityTelemetry({
        event: 'identity.wizard_required',
        state: resolvedState,
        pathname,
        timestamp: new Date().toISOString(),
      });
    }

    if (resolvedState === 'SUPERADMIN') {
      emitIdentityTelemetry({
        event: 'identity.superadmin_access',
        state: resolvedState,
        pathname,
        timestamp: new Date().toISOString(),
      });
    }

    if (resolvedState === 'ERROR') {
      emitIdentityTelemetry({
        event: 'identity.error_state',
        state: resolvedState,
        pathname,
        timestamp: new Date().toISOString(),
      });
    }

    // Redirect decision event
    if (redirectDecision?.shouldRedirect) {
      emitIdentityTelemetry({
        event: 'identity.redirect_decision',
        state: resolvedState,
        pathname,
        redirectDestination: redirectDecision.destination,
        timestamp: new Date().toISOString(),
      });
    }
  }, [resolvedState, pathname, isPublic, redirectDecision?.shouldRedirect, redirectDecision?.destination]);

  // ✅ HARD BYPASS: public routes must NEVER be blocked by auth/identity loaders
  if (isPublic) {
    return <>{children}</>;
  }

  // ✅ P-IMP-FIX — Block during impersonation resolution to prevent race conditions
  if (isImpersonating && resolutionStatus === 'RESOLVING') {
    console.log('[IDENTITY-GATE] Waiting for impersonation resolution');
    return (
      <IdentityLoadingScreen 
        onRetry={refreshIdentity} 
        onLogout={() => signOut()} 
      />
    );
  }

  // ===== DEV GUARDRAIL: OBSERVABILITY ONLY =====
  if (import.meta.env.DEV) {
    if (!isAuthenticated && pathname === '/identity/wizard') {
      console.warn('[IdentityGate] 🚨 DEV GUARDRAIL: Unauthenticated user landed on /identity/wizard', {
        pathname,
        isAuthenticated,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        hint: 'This should NEVER happen. Check isPublicPath() rules.',
      });
    }
  }

  // ===== RENDER BY STATE =====
  switch (resolvedState) {
    case 'LOADING':
      // Use dedicated IdentityLoadingScreen with UX-only timeout warning
      return (
        <IdentityLoadingScreen 
          onRetry={refreshIdentity} 
          onLogout={() => signOut()} 
        />
      );

    case 'UNAUTHENTICATED':
      return <Navigate to={redirectDecision.destination!} replace />;

    case 'WIZARD_REQUIRED':
      return <Navigate to={redirectDecision.destination!} replace />;

    case 'SUPERADMIN':
      if (redirectDecision.shouldRedirect) {
        // Check if superadmin is trying to access tenant route without impersonation
        const { isTenant, tenantSlug } = isTenantRoute(pathname);
        if (isTenant && tenantSlug) {
          // Show explanatory UI instead of silent redirect
          const hintText = t("identity.superadminTenantAccessHint").replace("{tenant}", tenantSlug);
          return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
              <Card className="max-w-md w-full">
                <CardHeader>
                  <AlertCircle className="h-8 w-8 text-warning mx-auto mb-2" />
                  <CardTitle className="text-center">{t("impersonation.accessDenied")}</CardTitle>
                  <CardDescription className="text-center">
                    {t("impersonation.superadminMustImpersonate")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground text-center">
                    {hintText}
                  </p>
                  <Button onClick={() => navigate("/admin")} className="w-full">
                    {t("impersonation.goToAdmin")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        }
        return <Navigate to={redirectDecision.destination!} replace />;
      }
      return <>{children}</>;

    case 'RESOLVED':
      if (!redirectPath && pathname === '/portal') {
        // No context error UI
        return (
          <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="max-w-md w-full">
              <CardHeader>
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <CardTitle className="text-center">{t("identity.noContext")}</CardTitle>
                <CardDescription className="text-center">{t("identity.noContextDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button onClick={refreshIdentity} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t("common.retry")}
                </Button>
                <Button variant="outline" onClick={() => signOut()} className="w-full">
                  {t("auth.logout")}
                </Button>
              </CardContent>
            </Card>
          </div>
        );
      }
      if (redirectDecision.shouldRedirect) {
        return <Navigate to={redirectDecision.destination!} replace />;
      }
      return <>{children}</>;

    case 'ERROR': {
      // Use explicit escape hatch with KEY-BASED i18n
      const escapeOptions = resolveErrorEscapeHatch(error);
      
      // Translate keys to strings (translation happens HERE, not in escape hatch)
      const userMessage = t(escapeOptions.userMessageKey) || escapeOptions.fallbackMessage || t('identity.error');
      const suggestion = t(escapeOptions.suggestionKey);
      const retryLabel = escapeOptions.canRetry ? t(escapeOptions.retryLabelKey) : '';
      const logoutLabel = t(escapeOptions.logoutLabelKey);
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <CardTitle className="text-center">{t("identity.error")}</CardTitle>
              <CardDescription className="text-center">
                {userMessage}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground text-center">
                {suggestion}
              </p>
              {escapeOptions.canRetry && (
                <Button onClick={refreshIdentity} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {retryLabel}
                </Button>
              )}
              {escapeOptions.canLogout && (
                <Button variant="outline" onClick={() => signOut()} className="w-full">
                  {logoutLabel}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    default:
      return <>{children}</>;
  }
}

export default IdentityGate;
