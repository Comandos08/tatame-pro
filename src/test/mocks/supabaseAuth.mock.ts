/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.A)
 *
 * Centralized Supabase Auth mock.
 * ALL auth tests MUST use this mock — inline mocking is FORBIDDEN.
 *
 * This mock covers ONLY supabase.auth.
 * No PostgREST, no storage, no realtime.
 */

import { vi } from 'vitest';
import { Session, User } from '@supabase/supabase-js';
import { FIXED_TEST_IDS, FIXED_TEST_TIME } from '@/test/test-utils/constants';

// ── Canonical test user ──

export const TEST_USER: User = {
  id: FIXED_TEST_IDS.USER_ID,
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: { name: 'Test User' },
  aud: 'authenticated',
  created_at: FIXED_TEST_TIME,
  updated_at: FIXED_TEST_TIME,
  role: '',
  confirmation_sent_at: undefined,
  confirmed_at: FIXED_TEST_TIME,
  last_sign_in_at: FIXED_TEST_TIME,
  phone: '',
  factors: [],
  identities: [],
};

// ── Canonical test session ──

export const TEST_SESSION: Session = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(new Date(FIXED_TEST_TIME).getTime() / 1000) + 3600,
  token_type: 'bearer',
  user: TEST_USER,
};

// ── Auth state change callback holder ──

type AuthCallback = (event: string, session: Session | null) => void;

let _authCallback: AuthCallback | null = null;

/**
 * Returns the currently registered auth callback.
 * Use this to simulate auth events in tests.
 */
export function getAuthCallback(): AuthCallback | null {
  return _authCallback;
}

/**
 * Simulates an auth state change event.
 */
export function simulateAuthEvent(event: string, session: Session | null): void {
  if (_authCallback) {
    _authCallback(event, session);
  }
}

// ── Mock factory ──

export interface SupabaseAuthMockOptions {
  /** Initial session returned by getSession(). Default: null */
  initialSession?: Session | null;
  /** Error to throw on signInWithPassword. Default: none */
  signInError?: Error | null;
  /** Error to throw on signUp. Default: none */
  signUpError?: Error | null;
}

/**
 * Creates the canonical Supabase auth mock.
 * Returns mock functions for assertion.
 */
export function createSupabaseAuthMock(options: SupabaseAuthMockOptions = {}) {
  const {
    initialSession = null,
    signInError = null,
    signUpError = null,
  } = options;

  _authCallback = null;

  const unsubscribe = vi.fn();

  const onAuthStateChange = vi.fn((callback: AuthCallback) => {
    _authCallback = callback;
    // Simulate INITIAL_SESSION synchronously (mirrors real Supabase behavior)
    setTimeout(() => {
      callback('INITIAL_SESSION', initialSession);
    }, 0);
    return { data: { subscription: { unsubscribe } } };
  });

  const getSession = vi.fn().mockResolvedValue({
    data: { session: initialSession },
    error: null,
  });

  const signInWithPassword = vi.fn().mockImplementation(async () => {
    if (signInError) {
      return { data: { user: null, session: null }, error: signInError };
    }
    return { data: { user: TEST_USER, session: TEST_SESSION }, error: null };
  });

  const signUp = vi.fn().mockImplementation(async () => {
    if (signUpError) {
      return { data: { user: null, session: null }, error: signUpError };
    }
    return { data: { user: TEST_USER, session: TEST_SESSION }, error: null };
  });

  const signOut = vi.fn().mockResolvedValue({ error: null });

  const auth = {
    onAuthStateChange,
    getSession,
    signInWithPassword,
    signUp,
    signOut,
  };

  return {
    auth,
    mocks: { onAuthStateChange, getSession, signInWithPassword, signUp, signOut, unsubscribe },
  };
}

/**
 * Installs the Supabase auth mock via vi.mock.
 * Must be called at module level or in beforeEach.
 */
export function installSupabaseAuthMock(options: SupabaseAuthMockOptions = {}) {
  const mock = createSupabaseAuthMock(options);

  vi.mock('@/integrations/supabase/client', () => ({
    supabase: {
      auth: mock.auth,
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    },
  }));

  return mock;
}
