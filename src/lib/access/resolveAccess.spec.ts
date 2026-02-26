import { describe, it, expect } from 'vitest';
import { resolveAccess, inferRouteContext } from './resolveAccess';
import type { AccessResolutionInput, AccessContext } from './types';

// ============================================================================
// HELPERS — Default inputs (all "happy path")
// ============================================================================
const defaultInput: AccessResolutionInput = {
  isAuthenticated: true,
  isAuthLoading: false,
  sessionUserId: 'user-1',
  identityState: 'resolved',
  identityError: null,
  wizardCompleted: true,
  tenantId: 'tenant-1',
  tenantSlug: 'academia-xyz',
  tenantIsActive: true,
  tenantIsLoading: false,
  tenantError: null,
  tenantStatus: 'ACTIVE',
  userRoles: ['ADMIN_TENANT'],
  rolesLoading: false,
  billingStatus: 'ACTIVE',
  billingIsBlocked: false,
  billingIsReadOnly: false,
  isGlobalSuperadmin: false,
  isImpersonating: false,
  impersonatedTenantId: null,
  impersonationResolutionStatus: 'IDLE',
};

const defaultContext: AccessContext = {
  pathname: '/academia-xyz/app/dashboard',
  requiresAuth: true,
  requiresTenant: true,
  requiredRoles: ['ADMIN_TENANT'],
  requiresBilling: true,
  requiresOnboarding: true,
};

function input(overrides: Partial<AccessResolutionInput>): AccessResolutionInput {
  return { ...defaultInput, ...overrides };
}

function context(overrides: Partial<AccessContext>): AccessContext {
  return { ...defaultContext, ...overrides };
}

// ============================================================================
// STEP 0: LOADING
// ============================================================================
describe('resolveAccess — Loading states', () => {
  it('returns LOADING when auth is loading', () => {
    const result = resolveAccess(input({ isAuthLoading: true }), defaultContext);
    expect(result.state).toBe('LOADING');
  });

  it('returns LOADING when tenant is loading', () => {
    const result = resolveAccess(input({ tenantIsLoading: true }), defaultContext);
    expect(result.state).toBe('LOADING');
  });

  it('returns LOADING when roles are loading', () => {
    const result = resolveAccess(input({ rolesLoading: true }), defaultContext);
    expect(result.state).toBe('LOADING');
  });

  it('returns LOADING when impersonation is resolving', () => {
    const result = resolveAccess(
      input({ impersonationResolutionStatus: 'RESOLVING' }),
      defaultContext
    );
    expect(result.state).toBe('LOADING');
  });

  it('returns LOADING when identity is loading and authenticated', () => {
    const result = resolveAccess(
      input({ identityState: 'loading' }),
      defaultContext
    );
    expect(result.state).toBe('LOADING');
  });
});

// ============================================================================
// STEP 1: AUTHENTICATION
// ============================================================================
describe('resolveAccess — Authentication', () => {
  it('denies NOT_AUTHENTICATED when not authenticated and route requires auth', () => {
    const result = resolveAccess(
      input({ isAuthenticated: false }),
      context({ requiresAuth: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('NOT_AUTHENTICATED');
  });

  it('allows unauthenticated access when route does not require auth', () => {
    const result = resolveAccess(
      input({ isAuthenticated: false, identityState: 'loading' }),
      context({
        requiresAuth: false,
        requiresTenant: false,
        requiresBilling: false,
        requiresOnboarding: false,
        requiredRoles: undefined,
      })
    );
    expect(result.state).toBe('ALLOWED');
  });
});

// ============================================================================
// STEP 2: IDENTITY ERROR
// ============================================================================
describe('resolveAccess — Identity errors', () => {
  it('returns ERROR with TIMEOUT for identity timeout', () => {
    const result = resolveAccess(
      input({
        identityState: 'error',
        identityError: { code: 'IDENTITY_TIMEOUT', message: 'Timeout' },
      }),
      defaultContext
    );
    expect(result.state).toBe('ERROR');
    if (result.state === 'ERROR') {
      expect(result.reason).toBe('TIMEOUT');
      expect(result.debugCode).toBe('IDENTITY_TIMEOUT');
    }
  });

  it('returns DENIED with BILLING_BLOCKED for billing error', () => {
    const result = resolveAccess(
      input({
        identityState: 'error',
        identityError: { code: 'BILLING_BLOCKED', message: 'Blocked' },
      }),
      defaultContext
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('BILLING_BLOCKED');
  });

  it('returns ERROR with UNKNOWN for other errors', () => {
    const result = resolveAccess(
      input({
        identityState: 'error',
        identityError: { code: 'SOMETHING_ELSE', message: 'Oops' },
      }),
      defaultContext
    );
    expect(result.state).toBe('ERROR');
    if (result.state === 'ERROR') {
      expect(result.reason).toBe('UNKNOWN_ERROR');
      expect(result.debugCode).toBe('SOMETHING_ELSE');
    }
  });
});

// ============================================================================
// STEP 3: WIZARD
// ============================================================================
describe('resolveAccess — Wizard check', () => {
  it('denies WIZARD_REQUIRED when identity is wizard_required', () => {
    const result = resolveAccess(
      input({ identityState: 'wizard_required' }),
      context({ requiresAuth: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('WIZARD_REQUIRED');
  });
});

// ============================================================================
// STEP 4: TENANT
// ============================================================================
describe('resolveAccess — Tenant checks', () => {
  it('denies TENANT_NOT_FOUND when tenant has error', () => {
    const result = resolveAccess(
      input({ tenantError: 'not found', tenantId: null }),
      context({ requiresTenant: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('TENANT_NOT_FOUND');
  });

  it('denies TENANT_BLOCKED when tenant is inactive', () => {
    const result = resolveAccess(
      input({ tenantIsActive: false }),
      context({ requiresTenant: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('TENANT_BLOCKED');
  });

  it('denies IMPERSONATION_REQUIRED when superadmin without impersonation', () => {
    const result = resolveAccess(
      input({ isGlobalSuperadmin: true, isImpersonating: false }),
      context({ requiresTenant: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('IMPERSONATION_REQUIRED');
  });

  it('denies IMPERSONATION_REQUIRED when superadmin impersonating wrong tenant', () => {
    const result = resolveAccess(
      input({
        isGlobalSuperadmin: true,
        isImpersonating: true,
        impersonatedTenantId: 'other-tenant',
      }),
      context({ requiresTenant: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('IMPERSONATION_REQUIRED');
  });

  it('skips tenant check when route does not require tenant', () => {
    const result = resolveAccess(
      input({ tenantId: null, tenantIsActive: false }),
      context({
        requiresTenant: false,
        requiresBilling: false,
        requiresOnboarding: false,
        requiredRoles: undefined,
      })
    );
    expect(result.state).toBe('ALLOWED');
  });
});

// ============================================================================
// STEP 5: ONBOARDING
// ============================================================================
describe('resolveAccess — Onboarding', () => {
  it('denies ONBOARDING_REQUIRED when tenant is in SETUP', () => {
    const result = resolveAccess(
      input({ tenantStatus: 'SETUP' }),
      context({ requiresOnboarding: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('ONBOARDING_REQUIRED');
  });
});

// ============================================================================
// STEP 6: ROLE
// ============================================================================
describe('resolveAccess — Role checks', () => {
  it('denies ROLE_DENIED when user lacks required role', () => {
    const result = resolveAccess(
      input({ userRoles: [] }),
      context({ requiredRoles: ['ADMIN_TENANT'] })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('ROLE_DENIED');
  });

  it('allows superadmin with valid impersonation bypassing role check', () => {
    const result = resolveAccess(
      input({
        isGlobalSuperadmin: true,
        isImpersonating: true,
        impersonatedTenantId: 'tenant-1',
        userRoles: [],
      }),
      context({ requiredRoles: ['ADMIN_TENANT'] })
    );
    expect(result.state).toBe('ALLOWED');
  });

  it('skips role check when no required roles', () => {
    const result = resolveAccess(
      input({ userRoles: [] }),
      context({
        requiredRoles: undefined,
        requiresBilling: false,
        requiresOnboarding: false,
      })
    );
    expect(result.state).toBe('ALLOWED');
  });
});

// ============================================================================
// STEP 7: BILLING
// ============================================================================
describe('resolveAccess — Billing', () => {
  it('denies BILLING_BLOCKED when billing is blocked', () => {
    const result = resolveAccess(
      input({ billingIsBlocked: true }),
      context({ requiresBilling: true })
    );
    expect(result.state).toBe('DENIED');
    if (result.state === 'DENIED') expect(result.reason).toBe('BILLING_BLOCKED');
  });

  it('skips billing check when route does not require billing', () => {
    const result = resolveAccess(
      input({ billingIsBlocked: true }),
      context({ requiresBilling: false })
    );
    expect(result.state).toBe('ALLOWED');
  });
});

// ============================================================================
// HAPPY PATH
// ============================================================================
describe('resolveAccess — success', () => {
  it('returns ALLOWED when all checks pass', () => {
    const result = resolveAccess(defaultInput, defaultContext);
    expect(result.state).toBe('ALLOWED');
  });
});

// ============================================================================
// inferRouteContext
// ============================================================================
describe('inferRouteContext', () => {
  it('classifies public paths as not requiring auth', () => {
    const ctx = inferRouteContext('/login');
    expect(ctx.requiresAuth).toBe(false);
  });

  it('classifies admin routes as requiring auth but not tenant', () => {
    const ctx = inferRouteContext('/admin/health');
    expect(ctx.requiresAuth).toBe(true);
    expect(ctx.requiresTenant).toBe(false);
  });

  it('classifies tenant app routes as fully protected', () => {
    const ctx = inferRouteContext('/academia-xyz/app/dashboard');
    expect(ctx.requiresAuth).toBe(true);
    expect(ctx.requiresTenant).toBe(true);
    expect(ctx.requiresBilling).toBe(true);
    expect(ctx.requiresOnboarding).toBe(true);
  });

  it('classifies tenant membership routes as public', () => {
    const ctx = inferRouteContext('/academia-xyz/membership/new');
    expect(ctx.requiresAuth).toBe(false);
    expect(ctx.requiresTenant).toBe(true);
  });

  it('classifies single-segment non-reserved path as tenant public (landing)', () => {
    const ctx = inferRouteContext('/something-unknown');
    expect(ctx.requiresTenant).toBe(true);
    expect(ctx.requiresAuth).toBe(false);
  });

  it('classifies reserved segments as requiring auth (fail-closed)', () => {
    const ctx = inferRouteContext('/admin/something');
    expect(ctx.requiresAuth).toBe(true);
  });
});
