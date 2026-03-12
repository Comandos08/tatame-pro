/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.B)
 *
 * Deterministic Identity Tests — Canonical Reference
 *
 * Rules:
 * - No Date.now() without freeze
 * - No real Supabase / real fetch
 * - No implicit state
 * - No UI text assertions
 * - Identity tests validate IdentityContext state transitions
 * - Auth is mocked at the boundary (supabase.auth)
 *
 * Architecture:
 * - Auth mock: hoisted vi.mock for supabase client (provides session)
 * - Identity mock: supabase.functions.invoke mock (provides edge function responses)
 * - Consumer: IdentityStateConsumer renders data-* attributes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { IdentityProvider, useIdentity } from '@/contexts/IdentityContext';
import { FIXED_TEST_IDS, FIXED_TEST_TIME } from '@/test/test-utils/constants';
import {
  IDENTITY_RESOLVED_RESPONSE,
  IDENTITY_WIZARD_REQUIRED_RESPONSE,
  IDENTITY_SUPERADMIN_RESPONSE,
  IDENTITY_ERROR_RESPONSE,
} from '@/test/mocks/identity.mock';

// ── Mutable auth mock refs (hoisted) ──

let mockInitialSession: any = null;
// authChangeCallback used in setupAuthMock
let authChangeCallback: ((_event: string, _session: any) => void) | null = null; void authChangeCallback;
const mockUnsubscribe = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();

// ── Mutable identity invoke mock ref ──

const mockInvoke = vi.fn();

// ── Hoisted supabase mock ──

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: any[]) => mockOnAuthStateChange(...args),
      getSession: (...args: any[]) => mockGetSession(...args),
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      signUp: (...args: any[]) => mockSignUp(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
    },
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
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

// ── Test constants ──

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

// ── Auth setup helper ──

function setupAuthMock(options: { initialSession?: any } = {}) {
  mockInitialSession = options.initialSession ?? null;
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

  mockSignInWithPassword.mockResolvedValue({ data: { user: TEST_USER, session: TEST_SESSION }, error: null });
  mockSignUp.mockResolvedValue({ data: { user: TEST_USER, session: TEST_SESSION }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
}

// ── Invoke mock helpers ──

function setInvokeMock(options: { response?: any; error?: Error | null; abort?: boolean } = {}) {
  if (options.abort) {
    mockInvoke.mockImplementation(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 0)
      )
    );
    return;
  }

  if (options.error) {
    mockInvoke.mockResolvedValue({ data: null, error: options.error });
    return;
  }

  const response = options.response ?? IDENTITY_ERROR_RESPONSE;
  mockInvoke.mockResolvedValue({ data: response, error: null });
}

// ── Identity State Consumer (semantic, data-attribute based) ──

function IdentityStateConsumer() {
  const state = useIdentity();

  return (
    <div
      data-testid="identity-state"
      data-identity-state={state.identityState}
      data-has-error={String(!!state.error)}
      data-error-code={state.error?.code ?? ''}
      data-has-tenant={String(!!state.tenant)}
      data-tenant-slug={state.tenant?.slug ?? ''}
      data-role={state.role ?? ''}
      data-wizard-completed={String(state.wizardCompleted)}
    />
  );
}

// ── Render helper ──

function renderWithIdentity() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <IdentityProvider>
          <IdentityStateConsumer />
        </IdentityProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// ── Setup / Teardown ──

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Test Suite ──

describe('PI U8.B — Identity Deterministic Tests', () => {
  describe('Fail-Closed Default', () => {
    it('T1: no session → identity stays in loading (fail-closed)', async () => {
      setupAuthMock({ initialSession: null });
      setInvokeMock({ response: IDENTITY_ERROR_RESPONSE });
      renderWithIdentity();

      // Wait for auth to resolve (no session)
      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        // Without session, IdentityContext calls reset() → loading
        // The gate (not tested here) maps this to UNAUTHENTICATED
        expect(el.dataset.identityState).toBe('LOADING');
        expect(el.dataset.hasTenant).toBe('false');
        expect(el.dataset.role).toBe('');
      });
    });

    it('T1b: no session → no invoke to edge function', async () => {
      setupAuthMock({ initialSession: null });
      setInvokeMock({ response: IDENTITY_RESOLVED_RESPONSE });
      renderWithIdentity();

      await waitFor(() => {
        expect(screen.getByTestId('identity-state').dataset.identityState).toBe('LOADING');
      });

      // Edge function should NOT be called without a session
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('Happy Path (Resolved)', () => {
    it('T2: session + resolve OK → RESOLVED with tenant and role', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ response: IDENTITY_RESOLVED_RESPONSE });
      renderWithIdentity();

      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('RESOLVED');
        expect(el.dataset.hasTenant).toBe('true');
        expect(el.dataset.tenantSlug).toBe('test-org');
        expect(el.dataset.role).toBe('ADMIN_TENANT');
        expect(el.dataset.hasError).toBe('false');
        expect(el.dataset.wizardCompleted).toBe('true');
      });
    });
  });

  describe('Resolve Failure', () => {
    it('T3: session OK + edge function returns ERROR → error state', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ response: IDENTITY_ERROR_RESPONSE });
      renderWithIdentity();

      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('ERROR');
        expect(el.dataset.hasError).toBe('true');
        expect(el.dataset.hasTenant).toBe('false');
      });
    });
  });

  describe('Wizard Required', () => {
    it('session OK + WIZARD_REQUIRED → wizard_required state', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ response: IDENTITY_WIZARD_REQUIRED_RESPONSE });
      renderWithIdentity();

      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('WIZARD_REQUIRED');
        expect(el.dataset.wizardCompleted).toBe('false');
        expect(el.dataset.hasTenant).toBe('false');
        expect(el.dataset.hasError).toBe('false');
      });
    });
  });

  describe('Superadmin', () => {
    it('session OK + SUPERADMIN_GLOBAL → superadmin state', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ response: IDENTITY_SUPERADMIN_RESPONSE });
      renderWithIdentity();

      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('SUPERADMIN');
        expect(el.dataset.role).toBe('SUPERADMIN_GLOBAL');
        expect(el.dataset.hasError).toBe('false');
      });
    });
  });

  describe('Timeout / Abort', () => {
    it('T4: AbortError → error state with IDENTITY_TIMEOUT', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ abort: true });
      renderWithIdentity();

      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('ERROR');
        expect(el.dataset.hasError).toBe('true');
        expect(el.dataset.errorCode).toBe('IDENTITY_TIMEOUT');
      });
    });
  });

  describe('Network / HTTP Errors', () => {
    it('network error → error state', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ error: new Error('Failed to fetch') });
      renderWithIdentity();

      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('ERROR');
        expect(el.dataset.hasError).toBe('true');
        expect(el.dataset.errorCode).toBe('UNKNOWN');
      });
    });

    it('HTTP 500 → error state', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ error: new Error('Internal server error') });
      renderWithIdentity();

      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('ERROR');
        expect(el.dataset.hasError).toBe('true');
      });
    });
  });

  describe('Auth ≠ Identity Boundary', () => {
    it('identity does NOT resolve before auth completes', async () => {
      // Auth starts loading, identity must wait
      setupAuthMock({ initialSession: null });
      setInvokeMock({ response: IDENTITY_RESOLVED_RESPONSE });
      renderWithIdentity();

      // Initially loading (auth hasn't resolved yet)
      const el = screen.getByTestId('identity-state');
      expect(el.dataset.identityState).toBe('LOADING');
    });

    it('identity resolves independently from profile loading', async () => {
      setupAuthMock({ initialSession: TEST_SESSION });
      setInvokeMock({ response: IDENTITY_RESOLVED_RESPONSE });
      renderWithIdentity();

      // Identity resolves via edge function, not via profile
      await waitFor(() => {
        const el = screen.getByTestId('identity-state');
        expect(el.dataset.identityState).toBe('RESOLVED');
      });
    });
  });
});
