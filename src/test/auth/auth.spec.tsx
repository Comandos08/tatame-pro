/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.A)
 *
 * Deterministic Auth Tests — Canonical Reference
 *
 * Rules:
 * - No Date.now() without freeze
 * - No real Supabase
 * - No implicit state
 * - No UI text assertions
 * - Auth ≠ Identity (never mixed)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { AuthProvider, useCurrentUser } from '@/contexts/AuthContext';
import React from 'react';
import { freezeTestTime, unfreezeTestTime } from '@/test/test-utils/mock-time';
import { FIXED_TEST_IDS } from '@/test/test-utils/constants';
import { FIXED_TEST_TIME } from '@/test/test-utils/constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mutable mock state (read by hoisted vi.mock) ──

let mockInitialSession: any = null;
let mockSignInError: Error | null = null;
let authChangeCallback: ((event: string, session: any) => void) | null = null;
const mockUnsubscribe = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();

// ── Hoisted mock (NO closures over non-hoisted variables) ──

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
      getSession: (...args: any[]) => mockGetSession(...args),
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/institutional', () => ({
  emitInstitutionalEvent: vi.fn(),
}));

// ── Test session/user constants ──

const TEST_USER = {
  id: FIXED_TEST_IDS.USER_ID,
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: { name: 'Test User' },
  aud: 'authenticated',
  created_at: FIXED_TEST_TIME,
};

const TEST_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: TEST_USER,
};

// ── Helpers ──

function setupMocks(options: { initialSession?: any; signInError?: Error | null } = {}) {
  mockInitialSession = options.initialSession ?? null;
  mockSignInError = options.signInError ?? null;
  authChangeCallback = null;

  mockOnAuthStateChange.mockImplementation((callback: any) => {
    authChangeCallback = callback;
    setTimeout(() => callback('INITIAL_SESSION', mockInitialSession), 0);
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });

  mockGetSession.mockResolvedValue({
    data: { session: mockInitialSession },
    error: null,
  });

  mockSignInWithPassword.mockImplementation(async () => {
    if (mockSignInError) {
      return { data: { user: null, session: null }, error: mockSignInError };
    }
    return { data: { user: TEST_USER, session: TEST_SESSION }, error: null };
  });

  mockSignUp.mockResolvedValue({ data: { user: TEST_USER, session: TEST_SESSION }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
}

function simulateAuthEvent(event: string, session: any) {
  if (authChangeCallback) authChangeCallback(event, session);
}

// ── Auth State Consumer (semantic, data-attribute based) ──

function AuthStateConsumer() {
  const state = useCurrentUser();

  return (
    <div
      data-testid="auth-state"
      data-authenticated={String(state.isAuthenticated)}
      data-loading={String(state.isLoading)}
      data-has-session={String(!!state.session)}
      data-has-user={String(!!state.currentUser)}
      data-superadmin={String(state.isGlobalSuperadmin)}
    />
  );
}

function renderWithAuth() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthStateConsumer />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// ── Setup / Teardown ──

beforeEach(() => {
  // Note: fake timers NOT used here because waitFor relies on real setTimeout.
  // Auth tests validate state transitions, not time-dependent logic.
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ── Test Suite ──

describe('PI U8.A — Auth Deterministic Tests', () => {
  describe('Login Success', () => {
    it('resolves isAuthenticated=true after SIGNED_IN event', async () => {
      setupMocks();
      renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('auth-state').dataset.loading).toBe('false');
      });

      act(() => {
        simulateAuthEvent('SIGNED_IN', TEST_SESSION);
      });

      await waitFor(() => {
        const el = screen.getByTestId('auth-state');
        expect(el.dataset.authenticated).toBe('true');
        expect(el.dataset.hasSession).toBe('true');
      });
    });

    it('does not wait for profile to resolve authentication', async () => {
      setupMocks();
      renderWithAuth();

      act(() => {
        simulateAuthEvent('SIGNED_IN', TEST_SESSION);
      });

      await waitFor(() => {
        const el = screen.getByTestId('auth-state');
        expect(el.dataset.authenticated).toBe('true');
        expect(el.dataset.hasUser).toBe('false');
      });
    });
  });

  describe('Login Failure', () => {
    it('remains unauthenticated when no session event fires', async () => {
      setupMocks({ signInError: new Error('Invalid login credentials') });
      renderWithAuth();

      await waitFor(() => {
        const el = screen.getByTestId('auth-state');
        expect(el.dataset.loading).toBe('false');
        expect(el.dataset.authenticated).toBe('false');
        expect(el.dataset.hasSession).toBe('false');
      });
    });

    it('signInWithPassword returns error for caller to handle', async () => {
      setupMocks({ signInError: new Error('Invalid login credentials') });

      const result = await mockSignInWithPassword({
        email: 'test@test.com',
        password: 'wrong',
      });

      expect(result.error).toBeTruthy();
      expect(result.error!.message).toBe('Invalid login credentials');
    });
  });

  describe('Session Existing (Reload)', () => {
    it('restores session from INITIAL_SESSION on mount', async () => {
      setupMocks({ initialSession: TEST_SESSION });
      renderWithAuth();

      await waitFor(() => {
        const el = screen.getByTestId('auth-state');
        expect(el.dataset.authenticated).toBe('true');
        expect(el.dataset.hasSession).toBe('true');
        expect(el.dataset.loading).toBe('false');
      });
    });

    it('getSession is called on mount', async () => {
      setupMocks({ initialSession: TEST_SESSION });
      renderWithAuth();

      await waitFor(() => {
        expect(mockGetSession).toHaveBeenCalled();
      });
    });
  });

  describe('Logout', () => {
    it('clears session and user on SIGNED_OUT event', async () => {
      setupMocks({ initialSession: TEST_SESSION });
      renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('auth-state').dataset.authenticated).toBe('true');
      });

      act(() => {
        simulateAuthEvent('SIGNED_OUT', null);
      });

      await waitFor(() => {
        const el = screen.getByTestId('auth-state');
        expect(el.dataset.authenticated).toBe('false');
        expect(el.dataset.hasSession).toBe('false');
        expect(el.dataset.hasUser).toBe('false');
      });
    });
  });

  describe('Fail-Closed Defaults', () => {
    it('starts in loading state (fail-closed)', () => {
      setupMocks();
      renderWithAuth();

      const el = screen.getByTestId('auth-state');
      expect(el.dataset.loading).toBe('true');
      expect(el.dataset.authenticated).toBe('false');
    });

    it('isGlobalSuperadmin defaults to false without profile', async () => {
      setupMocks({ initialSession: TEST_SESSION });
      renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('auth-state').dataset.superadmin).toBe('false');
      });
    });
  });

  describe('Auth ≠ Identity Boundary', () => {
    it('onAuthStateChange is registered on mount', () => {
      setupMocks();
      renderWithAuth();

      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    it('unsubscribe is called on unmount', async () => {
      setupMocks();
      const { unmount } = renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('auth-state').dataset.loading).toBe('false');
      });

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
