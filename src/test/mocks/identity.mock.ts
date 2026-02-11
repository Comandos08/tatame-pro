/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.B)
 *
 * Centralized Identity mock for IdentityContext tests.
 * ALL identity tests MUST use this mock — inline mocking is FORBIDDEN.
 *
 * This mock covers:
 * - supabase.auth.getSession() (for token retrieval inside IdentityContext)
 * - global fetch (for resolve-identity-wizard Edge Function calls)
 *
 * Does NOT mock: AuthContext (use auth mock for that layer).
 */

import { vi } from 'vitest';
import type { TenantInfo } from '@/contexts/IdentityContext';
import { FIXED_TEST_IDS } from '@/test/test-utils/constants';

// ── Canonical test data ──

export const TEST_TENANT: TenantInfo = {
  id: FIXED_TEST_IDS.TENANT_ID,
  slug: 'test-org',
  name: 'Test Organization',
};

export const IDENTITY_RESOLVED_RESPONSE = {
  status: 'RESOLVED',
  tenant: TEST_TENANT,
  role: 'ADMIN_TENANT' as const,
  redirectPath: '/test-org/app',
};

export const IDENTITY_WIZARD_REQUIRED_RESPONSE = {
  status: 'WIZARD_REQUIRED',
};

export const IDENTITY_SUPERADMIN_RESPONSE = {
  status: 'RESOLVED',
  tenant: null,
  role: 'SUPERADMIN_GLOBAL' as const,
  redirectPath: '/admin',
};

export const IDENTITY_ERROR_RESPONSE = {
  status: 'ERROR',
  error: {
    code: 'UNKNOWN' as const,
    message: 'Test error',
  },
};

// ── Mutable mock refs (set before each test) ──

/** The JSON body that fetch() will resolve with */
let _mockFetchResponse: any = IDENTITY_ERROR_RESPONSE;

/** HTTP status code for fetch */
let _mockFetchStatus: number = 200;

/** If set, fetch() will reject with this error */
let _mockFetchError: Error | null = null;

/** If > 0, fetch() will never resolve (simulates timeout) */
let _mockFetchNeverResolve: boolean = false;

// ── Setup helper ──

export interface IdentityMockOptions {
  /** Response body from resolve-identity-wizard. Default: ERROR (fail-closed) */
  fetchResponse?: any;
  /** HTTP status code. Default: 200 */
  fetchStatus?: number;
  /** If set, fetch rejects with this error */
  fetchError?: Error | null;
  /** If true, fetch never resolves (for timeout tests) */
  fetchNeverResolve?: boolean;
}

/**
 * Configure the identity mock state BEFORE rendering.
 * Must be called in beforeEach or at the start of each test.
 */
export function setupIdentityMocks(options: IdentityMockOptions = {}) {
  _mockFetchResponse = options.fetchResponse ?? IDENTITY_ERROR_RESPONSE;
  _mockFetchStatus = options.fetchStatus ?? 200;
  _mockFetchError = options.fetchError ?? null;
  _mockFetchNeverResolve = options.fetchNeverResolve ?? false;
}

/**
 * Creates the global fetch mock for identity edge function calls.
 * Call this ONCE in your test file (in beforeEach after setupIdentityMocks).
 *
 * Note: This mocks global.fetch selectively — only intercepts
 * resolve-identity-wizard calls; other URLs pass through.
 */
export function installIdentityFetchMock() {
  const originalFetch = globalThis.fetch;

  (globalThis as any).fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    // Only intercept identity edge function calls
    if (url.includes('resolve-identity-wizard')) {
      if (_mockFetchNeverResolve) {
        // Never resolve — simulates hang/timeout
        return new Promise<Response>(() => {});
      }

      if (_mockFetchError) {
        throw _mockFetchError;
      }

      return new Response(JSON.stringify(_mockFetchResponse), {
        status: _mockFetchStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Pass through for non-identity requests
    return originalFetch(input, init);
  });
}

/**
 * Restores original fetch. Call in afterEach.
 */
export function restoreIdentityFetchMock() {
  if ((globalThis.fetch as any)?.mockRestore) {
    (globalThis.fetch as any).mockRestore();
  }
  vi.restoreAllMocks();
}
