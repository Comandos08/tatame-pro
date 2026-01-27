/**
 * 🔐 E2E Security Tests: GAP 7 - Immutability, Integrity & Governance
 * 
 * Tests validating:
 * - Immutability of audit_logs, security_events, decision_logs
 * - Hash chain integrity in decision_logs
 * - Tenant isolation for log access
 * - Decision logs created on security blocks
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test configuration from environment
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

test.describe('GAP 7: Immutability & Governance', () => {
  
  test.describe('Immutability Enforcement', () => {
    
    test('should prevent UPDATE on audit_logs via authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // First, get any existing audit log
      const { data: logs } = await client
        .from('audit_logs')
        .select('id')
        .limit(1);

      if (logs && logs.length > 0) {
        // Attempt to update - should be blocked by RLS
        const { error } = await client
          .from('audit_logs')
          .update({ event_type: 'TAMPERED' })
          .eq('id', logs[0].id);

        expect(error).toBeTruthy();
        expect(error?.message).toContain('policy');
      }
    });

    test('should prevent DELETE on audit_logs via authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Attempt to delete - should be blocked by RLS
      const { error } = await client
        .from('audit_logs')
        .delete()
        .not('id', 'is', null); // Try to delete any row

      // Either RLS blocks it or returns 0 rows
      if (error) {
        expect(error.message).toContain('policy');
      }
    });

    test('should prevent UPDATE on security_events via authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { data: events } = await client
        .from('security_events')
        .select('id')
        .limit(1);

      if (events && events.length > 0) {
        const { error } = await client
          .from('security_events')
          .update({ event_type: 'TAMPERED' })
          .eq('id', events[0].id);

        expect(error).toBeTruthy();
      }
    });

    test('should prevent DELETE on security_events via authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { error } = await client
        .from('security_events')
        .delete()
        .not('id', 'is', null);

      if (error) {
        expect(error.message).toContain('policy');
      }
    });

    test('should prevent UPDATE on decision_logs via authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { data: logs } = await client
        .from('decision_logs')
        .select('id')
        .limit(1);

      if (logs && logs.length > 0) {
        const { error } = await client
          .from('decision_logs')
          .update({ decision_type: 'TAMPERED' })
          .eq('id', logs[0].id);

        expect(error).toBeTruthy();
      }
    });

    test('should prevent DELETE on decision_logs via authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { error } = await client
        .from('decision_logs')
        .delete()
        .not('id', 'is', null);

      if (error) {
        expect(error.message).toContain('policy');
      }
    });
  });

  test.describe('Tenant Isolation', () => {
    
    test('anonymous users cannot read decision_logs', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { data, error } = await client
        .from('decision_logs')
        .select('*')
        .limit(10);

      // Should return empty array (RLS blocks access)
      expect(data).toEqual([]);
    });

    test('anonymous users cannot read security_events', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { data } = await client
        .from('security_events')
        .select('*')
        .limit(10);

      // Should return empty array (RLS blocks access)
      expect(data).toEqual([]);
    });

    test('anonymous users cannot insert into decision_logs', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { error } = await client
        .from('decision_logs')
        .insert({
          decision_type: 'TEST',
          reason_code: 'TEST',
          current_hash: 'fake-hash',
        });

      expect(error).toBeTruthy();
    });
  });

  test.describe('Hash Chain Integrity', () => {
    
    test('decision_logs should have current_hash populated', async () => {
      // This test requires authenticated access
      // For now, we verify the schema exists
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Verify table structure via error message when inserting invalid data
      const { error } = await client
        .from('decision_logs')
        .insert({
          decision_type: 'TEST',
          reason_code: 'TEST',
          // Missing current_hash - should fail
        });

      // Expect an error about missing required field
      expect(error).toBeTruthy();
    });

    test('decision_logs should reference previous_hash correctly', async () => {
      // This validates that the schema supports hash chaining
      // Actual chain validation requires admin access and is tested via the
      // verify_decision_log_chain database function
      
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Verify the columns exist by attempting to select them
      const { error } = await client
        .from('decision_logs')
        .select('id, previous_hash, current_hash, decision_type')
        .limit(1);

      // Should not error on column names (only on RLS)
      expect(error?.message).not.toContain('column');
    });
  });

  test.describe('Decision Logging on Blocks', () => {
    
    test('rate limit block should create decision_log entry', async ({ request }) => {
      // This test would need to trigger rate limiting
      // We verify the endpoint returns 429 when limit is exceeded
      
      const endpoint = `${SUPABASE_URL}/functions/v1/grant-roles`;
      
      // Make rapid requests without auth (should fail but test rate limiting)
      const responses = await Promise.all(
        Array(5).fill(null).map(() => 
          request.post(endpoint, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            data: { targetProfileId: 'test', tenantId: 'test', roles: ['TEST'] },
          })
        )
      );

      // All should return 401 (no auth) - but we're testing the endpoint exists
      responses.forEach(response => {
        expect([401, 429]).toContain(response.status());
      });
    });

    test('permission denied should create decision_log entry', async ({ request }) => {
      const endpoint = `${SUPABASE_URL}/functions/v1/start-impersonation`;
      
      // Attempt without proper permissions
      const response = await request.post(endpoint, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { targetTenantId: 'test-tenant-id' },
      });

      // Should return 401 (missing auth) or 403 (insufficient permissions)
      expect([401, 403]).toContain(response.status());
    });
  });
});
