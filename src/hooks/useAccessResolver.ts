/**
 * ============================================================================
 * 🔐 useAccessResolver — Central Access Resolution Hook
 * ============================================================================
 * 
 * SAFE GOLD CONTRACT:
 * - Implements timeout protection (10s default)
 * - Aggregates all context state
 * - Delegates decision to pure resolveAccess function
 * - LOADING is temporary or becomes ERROR
 * 
 * This hook is the SINGLE SOURCE OF TRUTH for access decisions.
 * Guards consume this hook — they do not make independent decisions.
 * ============================================================================
 */

import { useRef, useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useIdentity } from '@/contexts/IdentityContext';
import { useTenant } from '@/contexts/TenantContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useTenantRoles } from '@/hooks/useTenantRoles';
import {
  AccessResult,
  AccessContext,
  AccessResolutionInput,
  ACCESS_RESOLUTION_TIMEOUT_MS,
} from '@/lib/access/types';
import { resolveAccess, inferRouteContext } from '@/lib/access/resolveAccess';
import { AppRole } from '@/types/auth';

interface UseAccessResolverOptions {
  /** Override required roles for this route */
  requiredRoles?: AppRole[];
  /** Override timeout (default: 10s) */
  timeoutMs?: number;
}

interface UseAccessResolverResult {
  /** Current access state */
  access: AccessResult;
  /** Retry access resolution */
  retry: () => void;
  /** Whether timeout has been reached */
  isTimedOut: boolean;
}

/**
 * Central hook for access resolution.
 * 
 * @example
 * const { access, retry } = useAccessResolver();
 * 
 * if (access.state === 'LOADING') return <Loading />;
 * if (access.state === 'DENIED') return <Denied reason={access.reason} />;
 * if (access.state === 'ERROR') return <Error message={access.error} />;
 * 
 * return <Outlet />;
 */
export function useAccessResolver(options: UseAccessResolverOptions = {}): UseAccessResolverResult {
  const { requiredRoles, timeoutMs = ACCESS_RESOLUTION_TIMEOUT_MS } = options;
  const location = useLocation();
  const pathname = location.pathname;

  // =========================================================================
  // STEP 1: Gather All Context State
  // =========================================================================
  
  // Auth context
  const { 
    session, 
    isAuthenticated, 
    isLoading: authLoading, 
    isGlobalSuperadmin 
  } = useCurrentUser();
  
  // Identity context
  const { 
    identityState, 
    error: identityError, 
    wizardCompleted,
    refreshIdentity 
  } = useIdentity();
  
  // Tenant context (may be null if not in tenant route)
  // Use try-catch pattern to handle being outside TenantProvider
  let tenantContext: ReturnType<typeof useTenant> | null = null;
  try {
    tenantContext = useTenant();
  } catch {
    // Outside TenantProvider - this is valid for non-tenant routes
    tenantContext = null;
  }
  const tenant = tenantContext?.tenant ?? null;
  const tenantLoading = tenantContext?.isLoading ?? false;
  const tenantError = tenantContext?.error ?? null;
  const billingInfo = tenantContext?.billingInfo ?? null;
  
  // Roles (only fetch if we have a tenant)
  const { 
    roles: userRoles, 
    isLoading: rolesLoading,
  } = useTenantRoles(tenant?.id);
  
  // Impersonation context
  const {
    isImpersonating,
    session: impersonationSession,
    resolutionStatus: impersonationResolutionStatus,
  } = useImpersonation();

  // =========================================================================
  // STEP 2: Timeout Protection
  // =========================================================================
  const [isTimedOut, setIsTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingStartRef = useRef<number | null>(null);

  // Track when we enter loading state
  useEffect(() => {
    // Compute preliminary access to check if loading
    const routeContext = inferRouteContext(pathname);
    const context: AccessContext = {
      pathname,
      requiresAuth: routeContext.requiresAuth ?? true,
      requiresTenant: routeContext.requiresTenant ?? false,
      requiredRoles: requiredRoles ?? [],
      requiresBilling: routeContext.requiresBilling ?? false,
      requiresOnboarding: routeContext.requiresOnboarding ?? false,
    };
    
    const input = buildInput();
    const preliminaryResult = resolveAccess(input, context);
    
    if (preliminaryResult.state === 'LOADING') {
      // Start timeout if not already running
      if (!loadingStartRef.current) {
        loadingStartRef.current = Date.now();
        timeoutRef.current = setTimeout(() => {
          setIsTimedOut(true);
        }, timeoutMs);
      }
    } else {
      // Clear timeout when not loading
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      loadingStartRef.current = null;
      setIsTimedOut(false);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    authLoading, 
    identityState, 
    tenantLoading, 
    rolesLoading, 
    impersonationResolutionStatus,
    pathname,
    timeoutMs
  ]);

  // =========================================================================
  // STEP 3: Build Input Object
  // =========================================================================
  function buildInput(): AccessResolutionInput {
    return {
      // Auth
      isAuthenticated,
      isAuthLoading: authLoading,
      sessionUserId: session?.user?.id ?? null,
      
      // Identity
      identityState,
      identityError: identityError ?? null,
      wizardCompleted,
      
      // Tenant
      tenantId: tenant?.id ?? null,
      tenantSlug: tenant?.slug ?? null,
      tenantIsActive: tenant?.isActive ?? false,
      tenantIsLoading: tenantLoading,
      tenantError: tenantError?.message ?? tenantError?.toString() ?? null,
      tenantStatus: tenant?.status as 'SETUP' | 'ACTIVE' | 'SUSPENDED' | null ?? null,
      
      // Roles
      userRoles: userRoles ?? [],
      rolesLoading,
      
      // Billing
      billingStatus: billingInfo?.status ?? null,
      billingIsBlocked: billingInfo ? !['ACTIVE', 'TRIALING'].includes(billingInfo.status) : false,
      billingIsReadOnly: billingInfo ? ['PAST_DUE', 'UNPAID', 'INCOMPLETE', 'TRIAL_EXPIRED'].includes(billingInfo.status) : false,
      
      // Impersonation
      isGlobalSuperadmin,
      isImpersonating,
      impersonatedTenantId: impersonationSession?.targetTenantId ?? null,
      impersonationResolutionStatus: impersonationResolutionStatus as 'IDLE' | 'RESOLVING' | 'RESOLVED',
    };
  }

  // =========================================================================
  // STEP 4: Resolve Access
  // =========================================================================
  const access = useMemo<AccessResult>(() => {
    // If timed out, return ERROR
    if (isTimedOut) {
      return {
        state: 'ERROR',
        error: 'Access resolution timed out. Please try again.',
        reason: 'TIMEOUT',
      };
    }
    
    // Build context from route
    const routeContext = inferRouteContext(pathname);
    const context: AccessContext = {
      pathname,
      requiresAuth: routeContext.requiresAuth ?? true,
      requiresTenant: routeContext.requiresTenant ?? false,
      requiredRoles: requiredRoles ?? [],
      requiresBilling: routeContext.requiresBilling ?? false,
      requiresOnboarding: routeContext.requiresOnboarding ?? false,
    };
    
    const input = buildInput();
    return resolveAccess(input, context);
  }, [
    isTimedOut,
    pathname,
    requiredRoles,
    isAuthenticated,
    authLoading,
    session?.user?.id,
    identityState,
    identityError,
    wizardCompleted,
    tenant,
    tenantLoading,
    tenantError,
    userRoles,
    rolesLoading,
    billingInfo,
    isGlobalSuperadmin,
    isImpersonating,
    impersonationSession?.targetTenantId,
    impersonationResolutionStatus,
  ]);

  // =========================================================================
  // STEP 5: Retry Handler
  // =========================================================================
  const retry = () => {
    setIsTimedOut(false);
    loadingStartRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    refreshIdentity();
  };

  return { access, retry, isTimedOut };
}
