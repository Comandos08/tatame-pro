/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.A)
 *
 * Auth Test Driver — declarative auth scenarios.
 * No logic. No assertions. Only data.
 *
 * Every auth test scenario MUST be declared here.
 */

import { Session } from '@supabase/supabase-js';
import { TEST_SESSION } from '@/test/mocks/supabaseAuth.mock';

// ── Scenario Types ──

export interface AuthScenario {
  name: string;
  description: string;
  initialSession: Session | null;
  signInError: Error | null;
  expectedState: {
    isAuthenticated: boolean;
    isLoading: boolean;
    hasSession: boolean;
    hasCurrentUser: boolean;
  };
}

// ── Canonical Scenarios ──

export const AUTH_SCENARIOS: Record<string, AuthScenario> = {
  LOGIN_SUCCESS: {
    name: 'Login Success',
    description: 'User logs in with valid credentials. Auth resolves immediately.',
    initialSession: null,
    signInError: null,
    expectedState: {
      isAuthenticated: true,
      isLoading: false,
      hasSession: true,
      hasCurrentUser: false, // Profile loads async, not blocking
    },
  },

  LOGIN_FAILURE: {
    name: 'Login Failure',
    description: 'User provides invalid credentials. State stays unauthenticated.',
    initialSession: null,
    signInError: new Error('Invalid login credentials'),
    expectedState: {
      isAuthenticated: false,
      isLoading: false,
      hasSession: false,
      hasCurrentUser: false,
    },
  },

  SESSION_EXISTING: {
    name: 'Session Existing (Reload)',
    description: 'Page reload with valid session. Auth restores from getSession.',
    initialSession: TEST_SESSION,
    signInError: null,
    expectedState: {
      isAuthenticated: true,
      isLoading: false,
      hasSession: true,
      hasCurrentUser: false, // Profile loads async
    },
  },

  UNAUTHENTICATED: {
    name: 'Unauthenticated',
    description: 'No session, no user. Clean unauthenticated state.',
    initialSession: null,
    signInError: null,
    expectedState: {
      isAuthenticated: false,
      isLoading: false,
      hasSession: false,
      hasCurrentUser: false,
    },
  },
};

// ── Helpers ──

/** Returns a resolved auth scenario (login success post-event) */
export function mockAuthResolved() {
  return {
    initialSession: TEST_SESSION,
    signInError: null,
  };
}

/** Returns an unauthenticated scenario */
export function mockAuthUnauthenticated() {
  return {
    initialSession: null,
    signInError: null,
  };
}

/** Returns a failed auth scenario */
export function mockAuthFailure(message = 'Invalid login credentials') {
  return {
    initialSession: null,
    signInError: new Error(message),
  };
}
