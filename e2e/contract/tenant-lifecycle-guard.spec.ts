/**
 * 🛡️ Tenant Lifecycle Guard Contract Tests
 * 
 * PI-D6.1 — Contract & Invariant Verification
 * 
 * Validates that Edge Functions respect I4 (Tenant Lifecycle):
 * - Tenant in SETUP: critical operations BLOCKED
 * - Tenant in BLOCKED: all operations BLOCKED
 * - Tenant in ACTIVE: operations ALLOWED (subject to other guards)
 * 
 * All tests use direct API calls, not UI interactions.
 * All errors return HTTP 200 with neutral messages (I6).
 * 
 * @contract TG.C — Tenant Lifecycle Guard
 */

import { test, expect } from '@playwright/test';
import { 
  invokeEdgeFunction,
  createTestSession,
  assertEdgeFunctionBlocked,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '../helpers/edge-function-invoker';
import {
  createAuthenticatedClient,
  invokeEdgeFunction as securityInvoke,
} from '../fixtures/securityTestClient';

/**
 * Test configuration - uses placeholder IDs that should be replaced
 * with actual test fixtures in a real test environment.
 */
const TEST_CONFIG = {
  // These would be populated from test fixtures in beforeAll
  tenantSetupId: '00000000-0000-0000-0000-000000000001',
  tenantBlockedId: '00000000-0000-0000-0000-000000000002',
  tenantActiveId: '00000000-0000-0000-0000-000000000003',
  membershipIdSetup: '00000000-0000-0000-0000-000000000011',
  membershipIdBlocked: '00000000-0000-0000-0000-000000000012',
  membershipIdActive: '00000000-0000-0000-0000-000000000013',
  athleteIdActive: '00000000-0000-0000-0000-000000000021',
  gradingLevelId: '00000000-0000-0000-0000-000000000031',
  nonExistentTenantId: '99999999-9999-9999-9999-999999999999',
  // Test user credentials
  testUserEmail: 'test-admin@tatame.test',
  testUserPassword: 'test-password-123',
};

test.describe('TG.C — Tenant Lifecycle Guard Contract', () => {
  
  /**
   * TG.C.1: generate-digital-card BLOCKS for tenant SETUP
   * 
   * When a membership belongs to a tenant in SETUP status,
   * the Edge Function MUST return success: false with TENANT_NOT_ACTIVE code.
   */
  test('TG.C.1: generate-digital-card BLOCKS for tenant SETUP', async () => {
    // Skip if no test session available
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'generate-digital-card',
      { membershipId: TEST_CONFIG.membershipIdSetup },
      {}
    );

    // I6: All errors return HTTP 200 (neutral)
    expect(result.status).toBe(200);
    
    // Operation MUST be blocked
    expect(result.data.success).toBe(false);
    
    // Error code MUST indicate tenant not active
    expect(result.data.code).toBe('TENANT_NOT_ACTIVE');
    
    // I6: No semantic leakage - generic error message
    expect(result.data.error).toBeDefined();
    expect(result.data.error).not.toContain('SETUP');
    expect(result.data.error).not.toContain('lifecycle');
  });

  /**
   * TG.C.2: generate-digital-card BLOCKS for tenant BLOCKED
   * 
   * When a membership belongs to a BLOCKED tenant,
   * the Edge Function MUST return success: false with TENANT_NOT_ACTIVE code.
   */
  test('TG.C.2: generate-digital-card BLOCKS for tenant BLOCKED', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'generate-digital-card',
      { membershipId: TEST_CONFIG.membershipIdBlocked },
      {}
    );

    expect(result.status).toBe(200);
    expect(result.data.success).toBe(false);
    expect(result.data.code).toBe('TENANT_NOT_ACTIVE');
  });

  /**
   * TG.C.3: generate-digital-card ALLOWS for tenant ACTIVE
   * 
   * When a membership belongs to an ACTIVE tenant,
   * the tenant lifecycle check MUST pass.
   * The operation may still fail for other reasons (billing, auth),
   * but NOT for tenant lifecycle.
   */
  test('TG.C.3: generate-digital-card ALLOWS for tenant ACTIVE', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'generate-digital-card',
      { membershipId: TEST_CONFIG.membershipIdActive },
      {}
    );

    expect(result.status).toBe(200);
    
    // If blocked, it should NOT be for tenant lifecycle
    if (result.data.success === false) {
      expect(result.data.code).not.toBe('TENANT_NOT_ACTIVE');
    }
  });

  /**
   * TG.C.4: generate-diploma BLOCKS for tenant SETUP
   * 
   * Diploma emission MUST be blocked for tenants in SETUP.
   */
  test('TG.C.4: generate-diploma BLOCKS for tenant SETUP', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'generate-diploma',
      { 
        athleteId: TEST_CONFIG.athleteIdActive,
        gradingLevelId: TEST_CONFIG.gradingLevelId,
        tenantId: TEST_CONFIG.tenantSetupId,
      },
      {}
    );

    expect(result.status).toBe(200);
    expect(result.data.success).toBe(false);
    expect(result.data.code).toBe('TENANT_NOT_ACTIVE');
  });

  /**
   * TG.C.5: generate-diploma BLOCKS for tenant BLOCKED
   * 
   * Diploma emission MUST be blocked for BLOCKED tenants.
   */
  test('TG.C.5: generate-diploma BLOCKS for tenant BLOCKED', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'generate-diploma',
      { 
        athleteId: TEST_CONFIG.athleteIdActive,
        gradingLevelId: TEST_CONFIG.gradingLevelId,
        tenantId: TEST_CONFIG.tenantBlockedId,
      },
      {}
    );

    expect(result.status).toBe(200);
    expect(result.data.success).toBe(false);
    expect(result.data.code).toBe('TENANT_NOT_ACTIVE');
  });

  /**
   * TG.C.6: Tenant inexistente retorna erro neutro
   * 
   * When tenant does not exist, the response MUST be neutral.
   * No information leakage about whether tenant exists.
   */
  test('TG.C.6: Non-existent tenant returns neutral error', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'generate-digital-card',
      { membershipId: TEST_CONFIG.nonExistentTenantId },
      {}
    );

    // I6: HTTP 200 always (neutral)
    expect(result.status).toBe(200);
    
    // Operation blocked
    expect(result.data.success).toBe(false);
    
    // Error message MUST NOT reveal tenant existence
    if (result.data.error) {
      expect(result.data.error).not.toContain('not found');
      expect(result.data.error).not.toContain('does not exist');
      expect(result.data.error).not.toContain('invalid tenant');
    }
  });

  /**
   * TG.C.7: Todas respostas são HTTP 200
   * 
   * All Edge Functions MUST return HTTP 200 for any error.
   * This prevents enumeration and information leakage.
   */
  test('TG.C.7: All responses are HTTP 200 (neutral)', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const testCases = [
      { fn: 'generate-digital-card', body: { membershipId: TEST_CONFIG.membershipIdSetup } },
      { fn: 'generate-digital-card', body: { membershipId: TEST_CONFIG.membershipIdBlocked } },
      { fn: 'generate-digital-card', body: { membershipId: TEST_CONFIG.nonExistentTenantId } },
      { fn: 'generate-digital-card', body: { membershipId: 'invalid-uuid' } },
      { fn: 'generate-diploma', body: { athleteId: 'x', gradingLevelId: 'y', tenantId: 'z' } },
    ];

    for (const testCase of testCases) {
      const result = await invokeEdgeFunction(testCase.fn, testCase.body, {});
      
      // I6: HTTP 200 always
      expect(result.status).toBe(200);
      
      // Never return 4xx or 5xx for blocked operations
      expect(result.status).not.toBeGreaterThanOrEqual(400);
    }
  });

});

/**
 * Utility: Log test step for debugging
 */
function logTestStep(step: string, data?: unknown): void {
  console.log(`[TG.C] ${step}`, data ? JSON.stringify(data, null, 2) : '');
}
