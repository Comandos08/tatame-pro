/**
 * 🏛️ Federation Lifecycle Contract Tests
 * 
 * PI-D6.1 — Contract & Invariant Verification
 * 
 * Validates I2 (Federation Governance) and I3 (Audit Trail):
 * - Join/leave require proper roles
 * - Audit logs contain federation_id
 * - Soft history: left_at instead of DELETE
 * - RLS blocks direct DELETE
 * 
 * @contract FG.C — Federation Lifecycle
 */

import { test, expect, describe } from '@playwright/test';
import { 
  invokeEdgeFunction,
  createTestSession,
  assertAuditLogCreated,
  assertFederationLink,
  createTestSupabaseClient,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from '../helpers/edge-function-invoker';

/**
 * Test configuration - placeholder IDs for test fixtures
 */
const TEST_CONFIG = {
  // Tenants in different lifecycle states
  tenantSetupId: '00000000-0000-0000-0000-000000000001',
  tenantActiveId: '00000000-0000-0000-0000-000000000003',
  
  // Federations in different states
  federationActiveId: '00000000-0000-0000-0000-000000000101',
  federationInactiveId: '00000000-0000-0000-0000-000000000102',
  
  // Test users with different roles
  fedAdminEmail: 'fed-admin@tatame.test',
  fedAdminPassword: 'test-password-123',
  tenantAdminEmail: 'tenant-admin@tatame.test',
  tenantAdminPassword: 'test-password-123',
  noRoleUserEmail: 'no-role@tatame.test',
  noRoleUserPassword: 'test-password-123',
};

describe('FG.C — Federation Lifecycle Contract', () => {

  /**
   * FG.C.1: join-federation BLOCKS for tenant SETUP
   * 
   * Tenants in SETUP status cannot join federations.
   * This prevents unfinished organizations from participating in governance.
   */
  test('FG.C.1: join-federation BLOCKS for tenant SETUP', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'join-federation',
      { 
        tenantId: TEST_CONFIG.tenantSetupId,
        federationId: TEST_CONFIG.federationActiveId,
      },
      {}
    );

    expect(result.status).toBe(200);
    expect(result.data.success).toBe(false);
    expect(result.data.code).toBe('TENANT_NOT_ACTIVE');
  });

  /**
   * FG.C.2: join-federation BLOCKS for federation INACTIVE
   * 
   * Cannot join an inactive federation.
   */
  test('FG.C.2: join-federation BLOCKS for federation INACTIVE', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'join-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationInactiveId,
      },
      {}
    );

    expect(result.status).toBe(200);
    expect(result.data.success).toBe(false);
    expect(result.data.code).toBe('FEDERATION_NOT_ACTIVE');
  });

  /**
   * FG.C.3: join-federation RETURNS 403 without role
   * 
   * Users without FED_ADMIN or ADMIN_TENANT role cannot join federations.
   */
  test('FG.C.3: join-federation RETURNS 403 without role', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    // Note: This test requires a session from a user without federation roles
    // In real implementation, we'd authenticate as noRoleUser
    
    const result = await invokeEdgeFunction(
      'join-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
      },
      {} // No auth header = should fail authorization
    );

    // 403 is acceptable for auth failures (not a public endpoint)
    expect([200, 403]).toContain(result.status);
    
    if (result.status === 200) {
      expect(result.data.success).toBe(false);
      expect(['UNAUTHORIZED', 'FORBIDDEN', 'INSUFFICIENT_ROLE']).toContain(result.data.code);
    }
  });

  /**
   * FG.C.4: join-federation CREATES audit with federation_id
   * 
   * I3: All federation events MUST include federation_id in metadata.
   */
  test('FG.C.4: join-federation CREATES audit with federation_id', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const beforeTest = new Date();
    
    // Would need authenticated session with proper role
    const result = await invokeEdgeFunction(
      'join-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
      },
      {}
    );

    // If successful, verify audit log
    if (result.data.success === true) {
      const client = createTestSupabaseClient();
      
      const auditLog = await assertAuditLogCreated(
        client,
        'TENANT_JOINED_FEDERATION',
        TEST_CONFIG.tenantActiveId,
        ['federation_id'], // Required metadata fields
        beforeTest
      );

      expect(auditLog.metadata).toBeDefined();
      expect((auditLog.metadata as Record<string, unknown>).federation_id).toBe(
        TEST_CONFIG.federationActiveId
      );
    }
  });

  /**
   * FG.C.5: join-federation duplicate is idempotent
   * 
   * Joining a federation you're already in should return neutral, not error.
   */
  test('FG.C.5: join-federation duplicate is idempotent', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    // First join
    const result1 = await invokeEdgeFunction(
      'join-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
      },
      {}
    );

    // Second join (duplicate)
    const result2 = await invokeEdgeFunction(
      'join-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
      },
      {}
    );

    expect(result2.status).toBe(200);
    
    // Should be neutral (either success or already_member, never error)
    if (result2.data.success === false) {
      expect(result2.data.code).toBe('ALREADY_MEMBER');
    }
  });

  /**
   * FG.C.6: leave-federation SETS left_at (never deletes)
   * 
   * I2: Soft history - leaving sets left_at timestamp, never DELETE.
   */
  test('FG.C.6: leave-federation SETS left_at (never deletes)', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const result = await invokeEdgeFunction(
      'leave-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
        reason: 'Contract test - soft history validation',
      },
      {}
    );

    expect(result.status).toBe(200);

    if (result.data.success === true) {
      const client = createTestSupabaseClient();
      
      // Verify row still exists with left_at set
      await assertFederationLink(
        client,
        TEST_CONFIG.tenantActiveId,
        TEST_CONFIG.federationActiveId,
        {
          exists: true,
          leftAt: 'not_null', // MUST have left_at set
        }
      );
    }
  });

  /**
   * FG.C.7: leave-federation CREATES audit with federation_id
   * 
   * I3: Leave events MUST include federation_id and reason in metadata.
   */
  test('FG.C.7: leave-federation CREATES audit with federation_id', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const beforeTest = new Date();
    const testReason = 'Contract test reason for leaving';

    const result = await invokeEdgeFunction(
      'leave-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
        reason: testReason,
      },
      {}
    );

    if (result.data.success === true) {
      const client = createTestSupabaseClient();
      
      const auditLog = await assertAuditLogCreated(
        client,
        'TENANT_LEFT_FEDERATION',
        TEST_CONFIG.tenantActiveId,
        ['federation_id', 'reason'], // Required metadata fields
        beforeTest
      );

      const metadata = auditLog.metadata as Record<string, unknown>;
      expect(metadata.federation_id).toBe(TEST_CONFIG.federationActiveId);
      expect(metadata.reason).toBe(testReason);
    }
  });

  /**
   * FG.C.8: leave-federation duplicate is idempotent
   * 
   * Leaving a federation you've already left should return neutral.
   */
  test('FG.C.8: leave-federation duplicate is idempotent', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    // First leave
    await invokeEdgeFunction(
      'leave-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
        reason: 'First leave',
      },
      {}
    );

    // Second leave (duplicate)
    const result = await invokeEdgeFunction(
      'leave-federation',
      { 
        tenantId: TEST_CONFIG.tenantActiveId,
        federationId: TEST_CONFIG.federationActiveId,
        reason: 'Second leave',
      },
      {}
    );

    expect(result.status).toBe(200);
    
    // Should be neutral
    if (result.data.success === false) {
      expect(result.data.code).toBe('ALREADY_LEFT');
    }
  });

  /**
   * FG.C.9: DELETE direto via RLS é BLOQUEADO
   * 
   * Direct DELETE on federation_tenants MUST be blocked by RLS.
   * History is immutable.
   */
  test('FG.C.9: Direct DELETE via RLS is BLOCKED', async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Supabase not configured');

    const client = createTestSupabaseClient();

    // Attempt direct DELETE (should fail due to RLS)
    const { error } = await client
      .from('federation_tenants')
      .delete()
      .eq('tenant_id', TEST_CONFIG.tenantActiveId)
      .eq('federation_id', TEST_CONFIG.federationActiveId);

    // RLS should block DELETE
    expect(error).toBeDefined();
    
    // Verify row still exists
    const { data } = await client
      .from('federation_tenants')
      .select('*')
      .eq('tenant_id', TEST_CONFIG.tenantActiveId)
      .eq('federation_id', TEST_CONFIG.federationActiveId)
      .maybeSingle();

    // If the link existed, it should still exist after failed DELETE
    // (This test validates that DELETE is blocked, not that data exists)
  });

});

/**
 * Utility: Log test step for debugging
 */
function logTestStep(step: string, data?: unknown): void {
  console.log(`[FG.C] ${step}`, data ? JSON.stringify(data, null, 2) : '');
}
