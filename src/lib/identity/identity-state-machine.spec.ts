import { describe, it, expect } from 'vitest';
import {
  resolveIdentityState,
  IdentityResolutionInput,
  isValidIdentityTransition,
  LOADING_STATE_CONTRACT,
} from './identity-state-machine';
import { resolveIdentityRedirect } from './identity-redirect-map';
import { resolveErrorEscapeHatch, assertErrorHasEscape } from './identity-error-escape';

describe('resolveIdentityState', () => {
  it('returns LOADING when auth is loading', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: false,
      isAuthLoading: true,
      backendStatus: null,
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('LOADING');
  });

  it('returns UNAUTHENTICATED when not authenticated', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: false,
      isAuthLoading: false,
      backendStatus: null,
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('UNAUTHENTICATED');
  });

  it('returns LOADING when authenticated but backend still loading', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: true,
      isAuthLoading: false,
      backendStatus: 'loading',
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('LOADING');
  });

  it('returns LOADING when backendStatus is null (initial)', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: true,
      isAuthLoading: false,
      backendStatus: null,
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('LOADING');
  });

  it('returns WIZARD_REQUIRED when backend says so', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: true,
      isAuthLoading: false,
      backendStatus: 'wizard_required',
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('WIZARD_REQUIRED');
  });

  it('returns SUPERADMIN when backend says so', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: true,
      isAuthLoading: false,
      backendStatus: 'superadmin',
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('SUPERADMIN');
  });

  it('returns RESOLVED when backend says resolved', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: true,
      isAuthLoading: false,
      backendStatus: 'resolved',
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('RESOLVED');
  });

  it('returns ERROR when hasError is true', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: true,
      isAuthLoading: false,
      backendStatus: 'resolved',
      hasError: true,
    };
    expect(resolveIdentityState(input)).toBe('ERROR');
  });

  it('returns ERROR when backend status is error', () => {
    const input: IdentityResolutionInput = {
      isAuthenticated: true,
      isAuthLoading: false,
      backendStatus: 'error',
      hasError: false,
    };
    expect(resolveIdentityState(input)).toBe('ERROR');
  });
});

describe('LOADING_STATE_CONTRACT', () => {
  it('defines timeout of 12 seconds', () => {
    expect(LOADING_STATE_CONTRACT.timeoutMs).toBe(12_000);
  });

  it('is never terminal', () => {
    expect(LOADING_STATE_CONTRACT.neverTerminal).toBe(true);
  });

  it('can transition to all non-LOADING states', () => {
    expect(LOADING_STATE_CONTRACT.transitionsTo).toContain('UNAUTHENTICATED');
    expect(LOADING_STATE_CONTRACT.transitionsTo).toContain('RESOLVED');
    expect(LOADING_STATE_CONTRACT.transitionsTo).toContain('ERROR');
  });
});

describe('resolveIdentityRedirect', () => {
  it('redirects UNAUTHENTICATED to /login', () => {
    const result = resolveIdentityRedirect('UNAUTHENTICATED', { currentPath: '/anything' });
    expect(result.shouldRedirect).toBe(true);
    expect(result.destination).toBe('/login');
  });

  it('does NOT redirect LOADING state (shows spinner)', () => {
    const result = resolveIdentityRedirect('LOADING', { currentPath: '/anything' });
    expect(result.shouldRedirect).toBe(false);
    expect(result.reason).toContain('spinner');
  });

  it('does NOT redirect ERROR state (shows escape UI)', () => {
    const result = resolveIdentityRedirect('ERROR', { currentPath: '/anything' });
    expect(result.shouldRedirect).toBe(false);
    expect(result.reason).toContain('escape');
  });

  it('redirects WIZARD_REQUIRED to /identity/wizard', () => {
    const result = resolveIdentityRedirect('WIZARD_REQUIRED', { currentPath: '/portal' });
    expect(result.shouldRedirect).toBe(true);
    expect(result.destination).toBe('/identity/wizard');
  });

  it('allows SUPERADMIN on /admin', () => {
    const result = resolveIdentityRedirect('SUPERADMIN', { currentPath: '/admin' });
    expect(result.shouldRedirect).toBe(false);
  });

  it('redirects SUPERADMIN from non-admin routes to /admin', () => {
    const result = resolveIdentityRedirect('SUPERADMIN', { currentPath: '/portal' });
    expect(result.shouldRedirect).toBe(true);
    expect(result.destination).toBe('/admin');
  });

  it('allows SUPERADMIN on impersonated tenant', () => {
    const result = resolveIdentityRedirect('SUPERADMIN', {
      currentPath: '/federacao-demo/app',
      isImpersonating: true,
      impersonationTenantSlug: 'federacao-demo',
    });
    expect(result.shouldRedirect).toBe(false);
  });

  it('uses backend redirectPath for RESOLVED on /portal', () => {
    const result = resolveIdentityRedirect('RESOLVED', {
      currentPath: '/portal',
      redirectPath: '/federacao-demo/portal',
    });
    expect(result.shouldRedirect).toBe(true);
    expect(result.destination).toBe('/federacao-demo/portal');
  });
});

describe('resolveErrorEscapeHatch', () => {
  it('always provides at least one escape option', () => {
    const errorCodes = ['UNKNOWN', 'PERMISSION_DENIED', 'TENANT_NOT_FOUND', 'IMPERSONATION_INVALID', null];

    for (const code of errorCodes) {
      const error = code ? { code: code as 'UNKNOWN', message: 'Test' } : null;
      const options = resolveErrorEscapeHatch(error);

      expect(options.canRetry || options.canLogout).toBe(true);
    }
  });

  it('PERMISSION_DENIED cannot retry but can logout', () => {
    const options = resolveErrorEscapeHatch({ code: 'PERMISSION_DENIED', message: 'Test' });
    expect(options.canRetry).toBe(false);
    expect(options.canLogout).toBe(true);
  });

  it('UNKNOWN can retry and logout', () => {
    const options = resolveErrorEscapeHatch({ code: 'UNKNOWN', message: 'Test' });
    expect(options.canRetry).toBe(true);
    expect(options.canLogout).toBe(true);
  });

  it('assertErrorHasEscape does not throw for valid errors', () => {
    expect(() => assertErrorHasEscape({ code: 'UNKNOWN', message: 'Test' })).not.toThrow();
    expect(() => assertErrorHasEscape(null)).not.toThrow();
  });
});

describe('isValidIdentityTransition', () => {
  it('allows LOADING -> RESOLVED', () => {
    expect(isValidIdentityTransition('LOADING', 'RESOLVED')).toBe(true);
  });

  it('allows LOADING -> ERROR', () => {
    expect(isValidIdentityTransition('LOADING', 'ERROR')).toBe(true);
  });

  it('allows ERROR -> LOADING (retry)', () => {
    expect(isValidIdentityTransition('ERROR', 'LOADING')).toBe(true);
  });

  it('allows ERROR -> UNAUTHENTICATED (logout)', () => {
    expect(isValidIdentityTransition('ERROR', 'UNAUTHENTICATED')).toBe(true);
  });

  it('allows self-transition', () => {
    expect(isValidIdentityTransition('RESOLVED', 'RESOLVED')).toBe(true);
  });
});
