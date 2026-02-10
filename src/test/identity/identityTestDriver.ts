/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.B)
 *
 * Identity Test Driver — declarative identity scenarios.
 * No logic. No assertions. Only data.
 *
 * Every identity test scenario MUST be declared here.
 */

import {
  IDENTITY_RESOLVED_RESPONSE,
  IDENTITY_WIZARD_REQUIRED_RESPONSE,
  IDENTITY_SUPERADMIN_RESPONSE,
  IDENTITY_ERROR_RESPONSE,
  TEST_TENANT,
  type IdentityMockOptions,
} from '@/test/mocks/identity.mock';

// ── Scenario Types ──

export interface IdentityScenario {
  name: string;
  description: string;
  /** Whether auth has a valid session (drives AuthContext mock) */
  hasSession: boolean;
  /** Identity mock options (fetch response from edge function) */
  identityMock: IdentityMockOptions;
  /** Expected identity state after resolution */
  expectedState: {
    identityState: string;
    hasError: boolean;
    hasTenant: boolean;
    hasRole: boolean;
  };
}

// ── Canonical Scenarios ──

export const IDENTITY_SCENARIOS: Record<string, IdentityScenario> = {
  /**
   * T1 — Fail-closed default: no session → identity stays loading/error
   * (IdentityContext resets to loading when not authenticated)
   */
  NO_SESSION: {
    name: 'No Session (Fail-Closed)',
    description: 'No auth session. Identity must not resolve. Fail-closed.',
    hasSession: false,
    identityMock: {
      fetchResponse: IDENTITY_ERROR_RESPONSE,
    },
    expectedState: {
      identityState: 'loading', // reset() sets to loading; gate maps to UNAUTHENTICATED
      hasError: false,
      hasTenant: false,
      hasRole: false,
    },
  },

  /**
   * T2 — Happy path: session + resolve OK → RESOLVED
   */
  SESSION_OK_RESOLVE_OK: {
    name: 'Happy Path (Resolved)',
    description: 'Valid session, edge function returns RESOLVED with tenant and role.',
    hasSession: true,
    identityMock: {
      fetchResponse: IDENTITY_RESOLVED_RESPONSE,
    },
    expectedState: {
      identityState: 'resolved',
      hasError: false,
      hasTenant: true,
      hasRole: true,
    },
  },

  /**
   * T3 — Resolve fails: session OK but edge function returns ERROR
   */
  SESSION_OK_RESOLVE_FAIL: {
    name: 'Resolve Failure',
    description: 'Valid session, but edge function returns ERROR.',
    hasSession: true,
    identityMock: {
      fetchResponse: IDENTITY_ERROR_RESPONSE,
    },
    expectedState: {
      identityState: 'error',
      hasError: true,
      hasTenant: false,
      hasRole: false,
    },
  },

  /**
   * Wizard required: session OK, no tenant/role yet
   */
  SESSION_OK_WIZARD_REQUIRED: {
    name: 'Wizard Required',
    description: 'Valid session, edge function returns WIZARD_REQUIRED.',
    hasSession: true,
    identityMock: {
      fetchResponse: IDENTITY_WIZARD_REQUIRED_RESPONSE,
    },
    expectedState: {
      identityState: 'wizard_required',
      hasError: false,
      hasTenant: false,
      hasRole: false,
    },
  },

  /**
   * Superadmin: session OK, superadmin role
   */
  SESSION_OK_SUPERADMIN: {
    name: 'Superadmin',
    description: 'Valid session, edge function returns SUPERADMIN_GLOBAL role.',
    hasSession: true,
    identityMock: {
      fetchResponse: IDENTITY_SUPERADMIN_RESPONSE,
    },
    expectedState: {
      identityState: 'superadmin',
      hasError: false,
      hasTenant: false, // superadmin has no tenant
      hasRole: true,
    },
  },

  /**
   * T4 — Timeout: edge function never responds
   */
  TIMEOUT: {
    name: 'Timeout',
    description: 'Edge function hangs. Identity should error with IDENTITY_TIMEOUT after abort.',
    hasSession: true,
    identityMock: {
      fetchError: Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    },
    expectedState: {
      identityState: 'error',
      hasError: true,
      hasTenant: false,
      hasRole: false,
    },
  },

  /**
   * Network error
   */
  NETWORK_ERROR: {
    name: 'Network Error',
    description: 'fetch() throws a network error.',
    hasSession: true,
    identityMock: {
      fetchError: new Error('Failed to fetch'),
    },
    expectedState: {
      identityState: 'error',
      hasError: true,
      hasTenant: false,
      hasRole: false,
    },
  },

  /**
   * HTTP error (non-200)
   */
  HTTP_ERROR: {
    name: 'HTTP Error',
    description: 'Edge function returns HTTP 500.',
    hasSession: true,
    identityMock: {
      fetchResponse: { error: { message: 'Internal server error' } },
      fetchStatus: 500,
    },
    expectedState: {
      identityState: 'error',
      hasError: true,
      hasTenant: false,
      hasRole: false,
    },
  },
};

// ── Helpers ──

export function mockIdentityResolved() {
  return { fetchResponse: IDENTITY_RESOLVED_RESPONSE };
}

export function mockIdentityWizardRequired() {
  return { fetchResponse: IDENTITY_WIZARD_REQUIRED_RESPONSE };
}

export function mockIdentityError() {
  return { fetchResponse: IDENTITY_ERROR_RESPONSE };
}

export function mockIdentitySuperadmin() {
  return { fetchResponse: IDENTITY_SUPERADMIN_RESPONSE };
}
