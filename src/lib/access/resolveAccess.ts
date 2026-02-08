/**
 * ============================================================================
 * 🔐 ACCESS RESOLVER — Pure Resolution Function
 * ============================================================================
 * 
 * SAFE GOLD CONTRACT:
 * - This function is PURE — no side effects
 * - This function DOES NOT navigate
 * - This function DOES NOT render
 * - This function DOES NOT log
 * - It ONLY decides
 * 
 * VERIFICATION SEQUENCE (fixed order):
 * 1. Auth → NOT_AUTHENTICATED
 * 2. Tenant (when required) → TENANT_REQUIRED / TENANT_NOT_FOUND / TENANT_BLOCKED
 * 3. Role → ROLE_DENIED
 * 4. Billing → BILLING_BLOCKED
 * 5. Onboarding → ONBOARDING_REQUIRED
 * ============================================================================
 */

import { AccessResult, AccessContext, AccessResolutionInput } from './types';

/**
 * Pure function that resolves access based on current state.
 * Returns a deterministic AccessResult — never null, never undefined.
 */
export function resolveAccess(
  input: AccessResolutionInput,
  context: AccessContext
): AccessResult {
  // =========================================================================
  // STEP 0: Loading States
  // =========================================================================
  // LOADING is a TEMPORARY state — caller must implement timeout
  
  // Auth is loading
  if (input.isAuthLoading) {
    return { state: 'LOADING' };
  }
  
  // Identity is loading (for authenticated users)
  if (input.isAuthenticated && input.identityState === 'loading') {
    return { state: 'LOADING' };
  }
  
  // Impersonation is resolving (for superadmin)
  if (input.isGlobalSuperadmin && input.isImpersonating && input.impersonationResolutionStatus === 'RESOLVING') {
    return { state: 'LOADING' };
  }
  
  // Tenant is loading (for tenant-scoped routes)
  if (context.requiresTenant && input.tenantIsLoading) {
    return { state: 'LOADING' };
  }
  
  // Roles are loading (for role-protected routes)
  if (context.requiredRoles && context.requiredRoles.length > 0 && input.rolesLoading) {
    return { state: 'LOADING' };
  }

  // =========================================================================
  // STEP 1: Authentication Check
  // =========================================================================
  if (context.requiresAuth && !input.isAuthenticated) {
    return { 
      state: 'DENIED', 
      reason: 'NOT_AUTHENTICATED',
      redirectTo: '/login'
    };
  }

  // =========================================================================
  // STEP 2: Identity Error Check
  // =========================================================================
  if (input.identityState === 'error' && input.identityError) {
    // Map identity errors to access denied reasons
    const errorCode = input.identityError.code;
    
    if (errorCode === 'IDENTITY_TIMEOUT') {
      return { 
        state: 'ERROR', 
        error: input.identityError.message,
        reason: 'TIMEOUT'
      };
    }
    
    if (errorCode === 'BILLING_BLOCKED') {
      return { 
        state: 'DENIED', 
        reason: 'BILLING_BLOCKED'
      };
    }
    
    return { 
      state: 'ERROR', 
      error: input.identityError.message,
      reason: 'UNKNOWN_ERROR'
    };
  }

  // =========================================================================
  // STEP 3: Wizard Check
  // =========================================================================
  if (context.requiresAuth && input.identityState === 'wizard_required') {
    return { 
      state: 'DENIED', 
      reason: 'WIZARD_REQUIRED',
      redirectTo: '/identity/wizard'
    };
  }

  // =========================================================================
  // STEP 4: Tenant Context Check
  // =========================================================================
  if (context.requiresTenant) {
    // Tenant not found
    if (input.tenantError || !input.tenantId) {
      return { 
        state: 'DENIED', 
        reason: 'TENANT_NOT_FOUND'
      };
    }
    
    // Tenant blocked (suspended/deleted)
    if (!input.tenantIsActive) {
      return { 
        state: 'DENIED', 
        reason: 'TENANT_BLOCKED'
      };
    }
    
    // Superadmin accessing tenant without impersonation
    if (input.isGlobalSuperadmin && !input.isImpersonating) {
      return { 
        state: 'DENIED', 
        reason: 'IMPERSONATION_REQUIRED',
        redirectTo: '/admin'
      };
    }
    
    // Superadmin impersonating wrong tenant
    if (input.isGlobalSuperadmin && input.isImpersonating && input.impersonatedTenantId !== input.tenantId) {
      return { 
        state: 'DENIED', 
        reason: 'IMPERSONATION_REQUIRED'
      };
    }
  }

  // =========================================================================
  // STEP 5: Onboarding Check
  // =========================================================================
  if (context.requiresOnboarding && input.tenantStatus === 'SETUP') {
    return { 
      state: 'DENIED', 
      reason: 'ONBOARDING_REQUIRED'
    };
  }

  // =========================================================================
  // STEP 6: Role Check
  // =========================================================================
  if (context.requiredRoles && context.requiredRoles.length > 0) {
    // Superadmin with valid impersonation bypasses role check
    if (input.isGlobalSuperadmin && input.isImpersonating && input.impersonatedTenantId === input.tenantId) {
      // Superadmin with valid impersonation - ALLOWED
    } else {
      const hasRequiredRole = context.requiredRoles.some(role => input.userRoles.includes(role));
      
      if (!hasRequiredRole) {
        return { 
          state: 'DENIED', 
          reason: 'ROLE_DENIED'
        };
      }
    }
  }

  // =========================================================================
  // STEP 7: Billing Check
  // =========================================================================
  if (context.requiresBilling && input.billingIsBlocked) {
    return { 
      state: 'DENIED', 
      reason: 'BILLING_BLOCKED'
    };
  }

  // =========================================================================
  // SUCCESS: All checks passed
  // =========================================================================
  return { state: 'ALLOWED' };
}

/**
 * Helper to determine route context from pathname
 */
export function inferRouteContext(pathname: string): Partial<AccessContext> {
  // Reserved segments that are NOT tenant slugs
  const RESERVED_SEGMENTS = new Set([
    'admin', 'portal', 'login', 'signup', 'auth', 'identity', 'help',
    'forgot-password', 'reset-password', 'about'
  ]);
  
  const segments = pathname.replace(/\/$/, '').split('/').filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();
  
  // Public paths
  const publicPaths = new Set([
    '/', '/about', '/login', '/signup', '/forgot-password', '/reset-password',
    '/help', '/auth/callback', '/identity/wizard', '/identity/error'
  ]);
  
  if (publicPaths.has(pathname)) {
    return {
      requiresAuth: false,
      requiresTenant: false,
      requiresBilling: false,
      requiresOnboarding: false
    };
  }
  
  // Admin routes (superadmin only)
  if (firstSegment === 'admin') {
    return {
      requiresAuth: true,
      requiresTenant: false,
      requiresBilling: false,
      requiresOnboarding: false
    };
  }
  
  // Portal routes
  if (firstSegment === 'portal') {
    return {
      requiresAuth: true,
      requiresTenant: false,
      requiresBilling: false,
      requiresOnboarding: false
    };
  }
  
  // Tenant routes (non-reserved first segment)
  if (segments.length > 0 && !RESERVED_SEGMENTS.has(firstSegment)) {
    const isAppRoute = segments.includes('app');
    
    // Tenant public routes (landing, events, verification)
    const tenantPublicPatterns = [
      /^\/[^/]+\/?$/,                    // /{tenant}
      /^\/[^/]+\/login\/?$/,             // /{tenant}/login
      /^\/[^/]+\/verify\/?.*$/,          // /{tenant}/verify/*
      /^\/[^/]+\/academies\/?$/,         // /{tenant}/academies
      /^\/[^/]+\/rankings\/?$/,          // /{tenant}/rankings
      /^\/[^/]+\/events\/?$/,            // /{tenant}/events
      /^\/[^/]+\/events\/[^/]+\/?$/,     // /{tenant}/events/{id}
      /^\/[^/]+\/membership\/?.*$/,      // /{tenant}/membership/*
    ];
    
    const isTenantPublic = tenantPublicPatterns.some(re => re.test(pathname));
    
    return {
      requiresAuth: !isTenantPublic,
      requiresTenant: true,
      requiresBilling: isAppRoute,
      requiresOnboarding: isAppRoute
    };
  }
  
  // Default: require auth
  return {
    requiresAuth: true,
    requiresTenant: false,
    requiresBilling: false,
    requiresOnboarding: false
  };
}
