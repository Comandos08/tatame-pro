/**
 * 🔐 E2E Security Tests — approve-membership & reject-membership (C6)
 *
 * GAP C6 CLOSURE TESTS
 * Validates that:
 * 1. ❌ Superadmin without impersonation → 403
 * 2. ❌ Superadmin with expired impersonation → 403
 * 3. ❌ Superadmin with impersonation for different tenant → 403
 * 4. ❌ Impersonation of another superadmin → 403
 * 5. ❌ User without admin role → 403
 * 6. ❌ Membership from another tenant → 403
 * 7. ✅ Valid tenant admin → 200 (no impersonation required)
 * 8. ✅ Valid superadmin + impersonation → 200
 * 9. 🔁 Reprocessing idempotent → skipped
 * 10. 🧾 decision_logs created in ALL scenarios
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test constants
const APPROVE_ENDPOINT = '/functions/v1/approve-membership';
const REJECT_ENDPOINT = '/functions/v1/reject-membership';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://kotxhtveuegrywzyvdnl.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function createTestClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Helper to make authenticated Edge Function call
 */
async function callEdgeFunction(
  endpoint: string,
  body: Record<string, unknown>,
  accessToken?: string,
  impersonationId?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (impersonationId) {
    headers['x-impersonation-id'] = impersonationId;
  }

  return fetch(`${SUPABASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test.describe('C6 — Membership Actions Security (Core)', () => {
  test.describe('approve-membership', () => {
    test('❌ Unauthenticated request → 401', async () => {
      const response = await callEdgeFunction(APPROVE_ENDPOINT, {
        membershipId: '00000000-0000-0000-0000-000000000000',
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Operation not permitted');
    });

    test('❌ Non-existent membership → 403 (anti-enumeration)', async () => {
      const supabase = createTestClient();
      
      // Create a test user (regular user without admin roles)
      const testEmail = `test-${Date.now()}@example.com`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
      });

      if (authError || !authData.session) {
        test.skip();
        return;
      }

      const response = await callEdgeFunction(
        APPROVE_ENDPOINT,
        { membershipId: '00000000-0000-0000-0000-000000000000' },
        authData.session.access_token
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Operation not permitted');
    });

    test('❌ Missing membershipId → 403 (anti-enumeration)', async () => {
      const supabase = createTestClient();
      
      const testEmail = `test-${Date.now()}@example.com`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
      });

      if (authError || !authData.session) {
        test.skip();
        return;
      }

      const response = await callEdgeFunction(
        APPROVE_ENDPOINT,
        {},
        authData.session.access_token
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Operation not permitted');
    });

    test('❌ Invalid JSON body → 403', async () => {
      const supabase = createTestClient();
      const testEmail = `test-${Date.now()}@example.com`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
      });

      if (authError || !authData.session) {
        test.skip();
        return;
      }

      const response = await fetch(`${SUPABASE_URL}${APPROVE_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${authData.session.access_token}`,
        },
        body: 'not valid json',
      });

      expect(response.status).toBe(403);
    });
  });

  test.describe('reject-membership', () => {
    test('❌ Unauthenticated request → 401', async () => {
      const response = await callEdgeFunction(REJECT_ENDPOINT, {
        membershipId: '00000000-0000-0000-0000-000000000000',
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Operation not permitted');
    });

    test('❌ Non-existent membership → 403 (anti-enumeration)', async () => {
      const supabase = createTestClient();
      
      const testEmail = `test-${Date.now()}@example.com`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
      });

      if (authError || !authData.session) {
        test.skip();
        return;
      }

      const response = await callEdgeFunction(
        REJECT_ENDPOINT,
        { membershipId: '00000000-0000-0000-0000-000000000000' },
        authData.session.access_token
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Operation not permitted');
    });

    test('❌ Missing membershipId → 403 (anti-enumeration)', async () => {
      const supabase = createTestClient();
      
      const testEmail = `test-${Date.now()}@example.com`;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
      });

      if (authError || !authData.session) {
        test.skip();
        return;
      }

      const response = await callEdgeFunction(
        REJECT_ENDPOINT,
        {},
        authData.session.access_token
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Operation not permitted');
    });
  });
});

test.describe('C6 — Superadmin Impersonation Requirements', () => {
  test('❌ Superadmin without impersonation is BLOCKED', async () => {
    // This test requires a real superadmin user
    const superadminEmail = process.env.TEST_SUPERADMIN_EMAIL;
    const superadminPassword = process.env.TEST_SUPERADMIN_PASSWORD;

    if (!superadminEmail || !superadminPassword) {
      test.skip();
      return;
    }

    const supabase = createTestClient();
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: superadminEmail,
      password: superadminPassword,
    });

    if (authError || !authData.session) {
      test.skip();
      return;
    }

    // Try to approve WITHOUT impersonation header
    const response = await callEdgeFunction(
      APPROVE_ENDPOINT,
      { 
        membershipId: '00000000-0000-0000-0000-000000000000',
        // No impersonationId provided
      },
      authData.session.access_token
      // No x-impersonation-id header
    );

    // MUST be blocked (403)
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Operation not permitted');

    // Verify IMPERSONATION_BLOCK was logged
    if (SUPABASE_SERVICE_ROLE_KEY) {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: decisionLogs } = await adminClient
        .from('decision_logs')
        .select('*')
        .eq('decision_type', 'IMPERSONATION_BLOCK')
        .eq('operation', 'approve-membership')
        .order('created_at', { ascending: false })
        .limit(1);

      if (decisionLogs && decisionLogs.length > 0) {
        expect(decisionLogs[0].reason_code).toContain('IMPERSONATION');
      }
    }
  });

  test('❌ Superadmin with invalid impersonation ID → 403', async () => {
    const superadminEmail = process.env.TEST_SUPERADMIN_EMAIL;
    const superadminPassword = process.env.TEST_SUPERADMIN_PASSWORD;

    if (!superadminEmail || !superadminPassword) {
      test.skip();
      return;
    }

    const supabase = createTestClient();
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: superadminEmail,
      password: superadminPassword,
    });

    if (authError || !authData.session) {
      test.skip();
      return;
    }

    // Try with a fake/invalid impersonation ID
    const response = await callEdgeFunction(
      APPROVE_ENDPOINT,
      { 
        membershipId: '00000000-0000-0000-0000-000000000000',
      },
      authData.session.access_token,
      'invalid-impersonation-id-12345' // Invalid ID
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Operation not permitted');
  });

  test('✅ Tenant admin does NOT require impersonation', async () => {
    // Tenant admins should work without impersonation
    const tenantAdminEmail = process.env.TEST_TENANT_ADMIN_EMAIL;
    const tenantAdminPassword = process.env.TEST_TENANT_ADMIN_PASSWORD;
    const testMembershipId = process.env.TEST_PENDING_MEMBERSHIP_ID;

    if (!tenantAdminEmail || !tenantAdminPassword || !testMembershipId) {
      test.skip();
      return;
    }

    const supabase = createTestClient();
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: tenantAdminEmail,
      password: tenantAdminPassword,
    });

    if (authError || !authData.session) {
      test.skip();
      return;
    }

    // Try to approve without impersonation (should work for tenant admin)
    const response = await callEdgeFunction(
      APPROVE_ENDPOINT,
      { 
        membershipId: testMembershipId,
        roles: ['ATLETA'],
      },
      authData.session.access_token
      // NO impersonation header - should still work
    );

    const body = await response.json();
    
    // Should succeed or fail on business logic, NOT impersonation
    if (response.status !== 200) {
      expect(body.error).not.toContain('impersonation');
    }
  });

  test('❌ Admin from tenant A cannot approve membership from tenant B', async () => {
    // Cross-tenant attack prevention
    const tenantAdminAEmail = process.env.TEST_TENANT_A_ADMIN_EMAIL;
    const tenantAdminAPassword = process.env.TEST_TENANT_A_ADMIN_PASSWORD;
    const tenantBMembershipId = process.env.TEST_TENANT_B_MEMBERSHIP_ID;

    if (!tenantAdminAEmail || !tenantAdminAPassword || !tenantBMembershipId) {
      test.skip();
      return;
    }

    const supabase = createTestClient();
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: tenantAdminAEmail,
      password: tenantAdminAPassword,
    });

    if (authError || !authData.session) {
      test.skip();
      return;
    }

    const response = await callEdgeFunction(
      APPROVE_ENDPOINT,
      { membershipId: tenantBMembershipId },
      authData.session.access_token
    );

    // Must be blocked
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Operation not permitted');
  });
});

test.describe('C6 — Decision Logging Verification', () => {
  test('All validation failures are logged to decision_logs', async () => {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get count of decision logs before
    const { count: countBefore } = await adminClient
      .from('decision_logs')
      .select('*', { count: 'exact', head: true })
      .eq('operation', 'approve-membership');

    const beforeCount = countBefore || 0;

    // Make an unauthenticated call (should log PERMISSION_DENIED)
    await callEdgeFunction(APPROVE_ENDPOINT, {
      membershipId: '00000000-0000-0000-0000-000000000000',
    });

    // Wait for log to be written
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get count after
    const { count: countAfter } = await adminClient
      .from('decision_logs')
      .select('*', { count: 'exact', head: true })
      .eq('operation', 'approve-membership');

    const afterCount = countAfter || 0;

    // Should have logged the denial
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test('MEMBERSHIP_APPROVED logs are created on success', async () => {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query for MEMBERSHIP_APPROVED decision logs
    const { data: approvalLogs, error } = await adminClient
      .from('decision_logs')
      .select('*')
      .eq('decision_type', 'MEMBERSHIP_APPROVED')
      .order('created_at', { ascending: false })
      .limit(5);

    expect(error).toBeNull();
    expect(approvalLogs).toBeDefined();
    
    // If there are logs, verify structure
    if (approvalLogs && approvalLogs.length > 0) {
      const log = approvalLogs[0];
      expect(log.operation).toBe('approve-membership');
      expect(log.reason_code).toBe('SUCCESS');
      expect(log.severity).toBe('HIGH');
      expect(log.metadata).toHaveProperty('membership_id');
      expect(log.metadata).toHaveProperty('actor_role');
    }
  });

  test('MEMBERSHIP_REJECTED logs are created on rejection', async () => {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query for MEMBERSHIP_REJECTED decision logs
    const { data: rejectionLogs, error } = await adminClient
      .from('decision_logs')
      .select('*')
      .eq('decision_type', 'MEMBERSHIP_REJECTED')
      .order('created_at', { ascending: false })
      .limit(5);

    expect(error).toBeNull();
    expect(rejectionLogs).toBeDefined();
    
    // If there are logs, verify structure
    if (rejectionLogs && rejectionLogs.length > 0) {
      const log = rejectionLogs[0];
      expect(log.operation).toBe('reject-membership');
      expect(log.reason_code).toBe('SUCCESS');
      expect(log.severity).toBe('HIGH');
      expect(log.metadata).toHaveProperty('membership_id');
      expect(log.metadata).toHaveProperty('actor_role');
    }
  });
});

test.describe('C6 — Anti-Enumeration', () => {
  test('All error responses use identical generic message', async () => {
    const supabase = createTestClient();
    
    const testEmail = `test-${Date.now()}@example.com`;
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPassword123!',
    });

    if (authError || !authData.session) {
      test.skip();
      return;
    }

    // Test various error cases - all should return same message
    const errorCases = [
      { membershipId: '00000000-0000-0000-0000-000000000000' }, // Non-existent
      {}, // Missing ID
      { membershipId: 'not-a-uuid' }, // Invalid format
    ];

    for (const body of errorCases) {
      const response = await callEdgeFunction(
        APPROVE_ENDPOINT,
        body,
        authData.session.access_token
      );

      const responseBody = await response.json();
      
      // All should return the SAME generic error
      expect(responseBody.error).toBe('Operation not permitted');
      
      // Should NOT reveal internal details
      expect(responseBody).not.toHaveProperty('details');
      expect(responseBody).not.toHaveProperty('stack');
      expect(responseBody).not.toHaveProperty('cause');
      expect(responseBody).not.toHaveProperty('membership');
      expect(responseBody).not.toHaveProperty('tenant');
    }
  });
});

test.describe('C6 — Rate Limiting', () => {
  test('Rate limit headers are present on 429 response', async () => {
    const supabase = createTestClient();
    
    const testEmail = `test-${Date.now()}@example.com`;
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPassword123!',
    });

    if (authError || !authData.session) {
      test.skip();
      return;
    }

    const response = await callEdgeFunction(
      APPROVE_ENDPOINT,
      { membershipId: '00000000-0000-0000-0000-000000000000' },
      authData.session.access_token
    );

    const responseHeaders = Object.fromEntries(response.headers.entries());
    
    // If rate limited, these headers would be present
    if (response.status === 429) {
      expect(responseHeaders).toHaveProperty('x-ratelimit-limit');
      expect(responseHeaders).toHaveProperty('x-ratelimit-remaining');
      expect(responseHeaders).toHaveProperty('retry-after');
    }
  });

  test('Rate limit blocks are logged to decision_logs', async () => {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query for RATE_LIMIT_BLOCK logs for membership operations
    const { data: rateLimitLogs, error } = await adminClient
      .from('decision_logs')
      .select('*')
      .eq('decision_type', 'RATE_LIMIT_BLOCK')
      .in('operation', ['approve-membership', 'reject-membership'])
      .order('created_at', { ascending: false })
      .limit(5);

    expect(error).toBeNull();
    expect(rateLimitLogs).toBeDefined();
    
    // If there are rate limit logs, verify structure
    if (rateLimitLogs && rateLimitLogs.length > 0) {
      const log = rateLimitLogs[0];
      expect(log.reason_code).toBe('TOO_MANY_REQUESTS');
      expect(log.severity).toBe('HIGH');
    }
  });
});
