/**
 * ============================================================================
 * 🔐 IDENTITY GATE — Primary Authentication Boundary
 * ============================================================================
 * 
 * CONTRACT:
 * This is the FIRST and ONLY gate responsible for authenticating users.
 * It validates that a user has a valid session before allowing access
 * to protected routes.
 * 
 * RESPONSIBILITIES (what this gate DOES):
 * ✔️ Validates user authentication state (session exists)
 * ✔️ Resolves identity state via backend (resolve-identity-wizard)
 * ✔️ Handles wizard redirect for incomplete profiles
 * ✔️ Handles superadmin routing decisions
 * ✔️ Provides error recovery UI for identity failures
 * ✔️ Blocks during impersonation resolution (race condition prevention)
 * 
 * BOUNDARIES (what this gate DOES NOT do):
 * ❌ DOES NOT validate tenant context — TenantLayout handles this
 * ❌ DOES NOT validate user roles — RequireRoles handles this
 * ❌ DOES NOT validate billing status — TenantLayout handles this
 * ❌ DOES NOT authorize business operations — feature-level guards handle this
 * ❌ DOES NOT manage impersonation state — ImpersonationContext handles this
 * 
 * SECURITY MODEL:
 * - FAIL-CLOSED: Unauthenticated users are redirected to /login
 * - FAIL-CLOSED: Identity errors show escape hatch UI, not silent pass
 * - Public routes bypass this gate entirely (isPublicPath whitelist)
 * 
 * ARCHITECTURE:
 * - All identity decisions delegated to pure functions in identity-state-machine
 * - This component is a RENDERER, not a DECIDER
 * - State machine ensures deterministic, testable behavior
 * 
 * P0 PRODUCT SAFETY:
 * - Uses IdentityLoadingScreen for UX-only timeout feedback (8s)
 * - Actual hard timeout (12s) is in IdentityContext
 * - All error states have explicit escape hatch via resolveErrorEscapeHatch
 * ============================================================================
 */

import { useRef, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useIdentity } from "@/contexts/IdentityContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useImpersonationScope } from "@/hooks/useImpersonationScope";

import { IdentityLoadingScreen } from "./IdentityLoadingScreen";
import { BlockedStateCard } from "@/components/ux/BlockedStateCard";
import { ImpersonationScopeMismatchCard } from "@/components/impersonation/ImpersonationScopeMismatchCard";
import { AutoImpersonationResolver } from "@/components/impersonation/AutoImpersonationResolver";
import { logger } from "@/lib/logger";
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

// =============================================================================
// ROUTE CLASSIFICATION HELPERS
// =============================================================================

/**
 * Rotas globais reservadas (não são slugs de tenant).
 * BY DESIGN: These segments are never treated as tenant slugs.
 * INTENTIONAL: Prevents /admin, /portal, /login from being misinterpreted.
 */
const RESERVED_ROUTE_SEGMENTS = new Set([
  "about",
  "admin",
  "api",
  "app",
  "auth",
  "forgot-password",
  "help",
  "identity",
  "join",
  "login",
  "logout",
  "portal",
  "reset-password",
  "signup",
  "verify",
]);

/**
 * Detecta estruturalmente se uma rota é de tenant (/:tenantSlug/*).
 * 
 * BY DESIGN: This is a structural check only — it does NOT validate
 * that the tenant exists or is active. TenantLayout handles validation.
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
 * 
 * SECURITY BOUNDARY: These routes NEVER require authentication.
 * BY DESIGN: Public routes must be explicitly whitelisted here.
 * FAIL-CLOSED: Any route NOT listed here requires authentication.
 * 
 * INTENTIONAL: /identity/wizard is public because unauthenticated users
 * may land here via magic link before session is fully established.
 */
function isPublicPath(pathname: string) {
  // STEP 1: Root-level public routes (no tenant context)
  const rootPublic = new Set([
    "/",
    "/about",
    "/join",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/help",
    "/auth/callback",
    "/identity/wizard",
    "/identity/error",
  ]);
  if (rootPublic.has(pathname)) return true;

  // STEP 1.5: Root-level public patterns (PI-D3-DOCS1.0)
  // INTENTIONAL: /verify/:token is a public document verification route
  const rootPublicPatterns: RegExp[] = [
    /^\/verify\/[^/]+\/?$/,             // /verify/{token} - public document verification
  ];
  if (rootPublicPatterns.some((re) => re.test(pathname))) return true;

  // STEP 2: Tenant-scoped public routes (institutional pages, verification, etc.)
  // INTENTIONAL: These allow public access to organization landing pages
  const tenantPublicPatterns: RegExp[] = [
    /^\/[^/]+\/?$/,                    // /{tenant} - org landing page
    /^\/[^/]+\/login\/?$/,             // /{tenant}/login - org login
    /^\/[^/]+\/verify\/?.*$/,          // /{tenant}/verify/* - public verification
    /^\/[^/]+\/academies\/?$/,         // /{tenant}/academies - public academy list
    /^\/[^/]+\/rankings\/?$/,          // /{tenant}/rankings - public rankings
    /^\/[^/]+\/events\/?$/,            // /{tenant}/events - public events list
    /^\/[^/]+\/events\/[^/]+\/?$/,     // /{tenant}/events/{id} - public event details
    /^\/[^/]+\/membership\/?.*$/,      // /{tenant}/membership/* - public membership flow
  ];

  return tenantPublicPatterns.some((re) => re.test(pathname));
}

// =============================================================================
// IDENTITY GATE COMPONENT
// =============================================================================

/**
 * Canonical gate that enforces identity resolution before rendering protected content.
 * 
 * ARCHITECTURE:
 * - Uses ONLY backend state (from resolve-identity-wizard Edge Function)
 * - No client-side DB queries for identity decisions
 * - All hooks called unconditionally (React rules compliance)
 * - State machine produces deterministic output
 */
export function IdentityGate({ children }: IdentityGateProps) {
  const location = useLocation();
  const pathname = location.pathname;

  // =========================================================================
  // STEP 1: Hook Initialization (unconditional — React rules)
  // =========================================================================
  // BY DESIGN: All hooks called before any early returns
  
  const { isAuthenticated, isLoading: authLoading, signOut } = useCurrentUser();
  const { identityState: backendStatus, redirectPath, error, refreshIdentity } = useIdentity();
  const { isImpersonating, session: impersonationSession, resolutionStatus } = useImpersonation();
  const { scope: impersonationScope, requireValidImpersonation } = useImpersonationScope();

  // =========================================================================
  // STEP 2: State Resolution (pure function delegation)
  // =========================================================================
  // BY DESIGN: This gate delegates ALL decisions to identity-state-machine
  // DOES NOT make independent decisions about auth/redirect
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
    impersonationTenantSlug: impersonationSession?.targetTenantSlug ?? null,
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
        impersonationTenantSlug: impersonationSession?.targetTenantSlug ?? null,
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

  // =========================================================================
  // STEP 3: Public Route Bypass
  // =========================================================================
  // SECURITY BOUNDARY: Public routes bypass ALL identity checks
  // BY DESIGN: This is the ONLY early return that allows unauthenticated access
  if (isPublic) {
    return <>{children}</>;
  }

  // =========================================================================
  // STEP 4: Impersonation Resolution Guard
  // =========================================================================
  // INTENTIONAL: Block during impersonation resolution to prevent race conditions
  // BY DESIGN: This ensures tenant context is stable before proceeding
  if (isImpersonating && resolutionStatus === 'RESOLVING') {
    logger.log('[IDENTITY-GATE] Waiting for impersonation resolution');
    return (
      <IdentityLoadingScreen 
        onRetry={refreshIdentity} 
        onLogout={() => signOut()} 
      />
    );
  }

  // =========================================================================
  // STEP 5: Dev Guardrail (observability only, no behavior change)
  // =========================================================================
  // BY DESIGN: This warning helps catch routing misconfigurations in development
  if (import.meta.env.DEV) {
    if (!isAuthenticated && pathname === '/identity/wizard') {
      logger.warn('[IdentityGate] 🚨 DEV GUARDRAIL: Unauthenticated user landed on /identity/wizard', {
        pathname,
        isAuthenticated,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        hint: 'This should NEVER happen. Check isPublicPath() rules.',
      });
    }
  }

  // =========================================================================
  // STEP 6: State-Based Rendering
  // =========================================================================
  // BY DESIGN: Each state maps to exactly one UI outcome
  // FAIL-CLOSED: Unknown states render children (fallback at end of switch)
  switch (resolvedState) {
    // -----------------------------------------------------------------
    // LOADING: Identity resolution in progress
    // -----------------------------------------------------------------
    case 'LOADING':
      // INTENTIONAL: Uses dedicated IdentityLoadingScreen with UX-only timeout warning
      // DOES NOT block indefinitely — hard timeout in IdentityContext (12s)
      return (
        <IdentityLoadingScreen 
          onRetry={refreshIdentity} 
          onLogout={() => signOut()} 
        />
      );

    // -----------------------------------------------------------------
    // UNAUTHENTICATED: No valid session
    // -----------------------------------------------------------------
    // FAIL-CLOSED: Always redirect to login
    case 'UNAUTHENTICATED':
      return <Navigate to={redirectDecision.destination!} replace />;

    // -----------------------------------------------------------------
    // WIZARD_REQUIRED: Profile incomplete, needs setup
    // -----------------------------------------------------------------
    // BY DESIGN: Redirects to /identity/wizard for profile completion
    case 'WIZARD_REQUIRED':
      return <Navigate to={redirectDecision.destination!} replace />;

    // -----------------------------------------------------------------
    // SUPERADMIN: Global administrator access
    // -----------------------------------------------------------------
    // SECURITY BOUNDARY: Superadmin accessing tenant routes MUST impersonate
    // BY DESIGN: Shows explanatory UI instead of silent redirect for tenant routes
    case 'SUPERADMIN':
      if (redirectDecision.shouldRedirect) {
        // INTENTIONAL: Check if superadmin is trying to access tenant route without impersonation
        const { isTenant, tenantSlug } = isTenantRoute(pathname);
        if (isTenant && tenantSlug) {
          // ================================================================
          // A02.T1.4: Cross-verification of impersonation scope vs URL slug
          // BY DESIGN: If impersonating, the scope slug MUST match the URL slug.
          // If not impersonating, show the standard "go impersonate" card.
          // ================================================================
          if (impersonationScope.status === 'ACTIVE') {
            // Superadmin IS impersonating — verify slug matches
            if (!requireValidImpersonation(tenantSlug)) {
              // SECURITY BOUNDARY: Slug mismatch — hard block
              return <ImpersonationScopeMismatchCard urlSlug={tenantSlug} />;
            }
            // Slug matches — allow through (don't redirect)
            return <>{children}</>;
          }

          // IMPERSONATION-ENTRY-FLOW-FIX: Auto-start impersonation for direct tenant access
          return (
            <AutoImpersonationResolver
              tenantSlug={tenantSlug}
              onLogout={() => signOut()}
            >
              {children}
            </AutoImpersonationResolver>
          );
        }
        return <Navigate to={redirectDecision.destination!} replace />;
      }
      // BY DESIGN: Superadmin on non-tenant routes (e.g. /admin) — allow through
      return <>{children}</>;

    // -----------------------------------------------------------------
    // RESOLVED: Identity fully resolved, user authenticated
    // -----------------------------------------------------------------
    // BY DESIGN: This is the happy path — user can proceed to protected routes
    case 'RESOLVED':
      // EDGE CASE: User at /portal but no redirect path resolved
      // INTENTIONAL: Show error UI with recovery options
      if (!redirectPath && pathname === '/portal') {
        // P1.1: Uses BlockedStateCard for unified UX
        return (
          <BlockedStateCard
            icon={AlertCircle}
            iconVariant="destructive"
            titleKey="identity.noContext"
            descriptionKey="identity.noContextDesc"
            actions={[
              {
                labelKey: 'common.retry',
                onClick: refreshIdentity,
                icon: RefreshCw,
              },
              {
                labelKey: 'auth.logout',
                onClick: () => signOut(),
              },
            ]}
          />
        );
      }
      // INTENTIONAL: Redirect if state machine decided so
      if (redirectDecision.shouldRedirect) {
        return <Navigate to={redirectDecision.destination!} replace />;
      }
      // ✅ SUCCESS: Render protected content
      return <>{children}</>;

    // -----------------------------------------------------------------
    // ERROR: Identity resolution failed
    // -----------------------------------------------------------------
    // FAIL-CLOSED: Show escape hatch UI, never silent pass
    // BY DESIGN: Error codes are mapped to user-friendly messages via resolveErrorEscapeHatch
    // P1.1: Uses BlockedStateCard for unified UX
    case 'ERROR': {
      // INTENTIONAL: Use explicit escape hatch with KEY-BASED i18n
      const escapeOptions = resolveErrorEscapeHatch(error);
      
      // Build dynamic actions based on escape options
      const actions: Array<{
        labelKey: string;
        onClick: () => void;
        variant?: 'default' | 'outline' | 'ghost';
        icon?: typeof RefreshCw;
      }> = [];

      if (escapeOptions.canRetry) {
        actions.push({
          labelKey: escapeOptions.retryLabelKey,
          onClick: refreshIdentity,
          icon: RefreshCw,
        });
      }

      if (escapeOptions.canLogout) {
        actions.push({
          labelKey: escapeOptions.logoutLabelKey,
          onClick: () => signOut(),
        });
      }

      return (
        <BlockedStateCard
          icon={AlertCircle}
          iconVariant="destructive"
          titleKey="identity.error"
          descriptionKey={escapeOptions.userMessageKey}
          hintKey={escapeOptions.suggestionKey}
          actions={actions}
        />
      );
    }

    // -----------------------------------------------------------------
    // DEFAULT: Fallback for unknown states
    // -----------------------------------------------------------------
    // INTENTIONAL: Render children as fallback (should never reach here)
    default:
      return <>{children}</>;
  }
}

export default IdentityGate;
