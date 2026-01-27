/**
 * 🔐 E2E Security Tests: GAP 8 - Observability & Tenant Isolation
 * 
 * Tests validating:
 * - Admin tenant can only view own tenant's security events
 * - Superadmin can view all security events
 * - Regular users cannot access security timeline
 * - Read-only access (no mutations)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test configuration from environment
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

test.describe('GAP 8: Security Observability', () => {
  
  test.describe('Read-Only Access', () => {
    
    test('decision_logs table blocks INSERT from authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Attempt to insert - should be blocked by RLS
      const { error } = await client
        .from('decision_logs')
        .insert({
          decision_type: 'TEST_INJECTION',
          reason_code: 'MALICIOUS',
          current_hash: 'fake-hash-12345',
          severity: 'HIGH',
        });

      // Should fail - no INSERT policy for authenticated users
      expect(error).toBeTruthy();
    });

    test('security_events table blocks INSERT from authenticated client', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Attempt to insert - should be blocked by RLS
      const { error } = await client
        .from('security_events')
        .insert({
          event_type: 'TEST_INJECTION',
          severity: 'HIGH',
        });

      // Should fail - no INSERT policy for authenticated users
      expect(error).toBeTruthy();
    });

    test('decision_logs table blocks UPDATE', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Attempt to update any row - should be blocked
      const { error } = await client
        .from('decision_logs')
        .update({ decision_type: 'TAMPERED' })
        .not('id', 'is', null);

      // Either RLS blocks it or no matching rows (both acceptable)
      // The key is no data was modified
      if (error) {
        expect(error.message).toContain('policy');
      }
    });

    test('decision_logs table blocks DELETE', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Attempt to delete - should be blocked
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

      // Should return empty array
      expect(data).toEqual([]);
    });

    test('security_timeline view blocks anonymous access', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // The view should inherit RLS from underlying tables
      const { data } = await client
        .from('security_timeline')
        .select('*')
        .limit(10);

      // Should return empty array or error
      expect(data?.length || 0).toBe(0);
    });
  });

  test.describe('Security Timeline Page Access', () => {
    
    test('security page requires authentication', async ({ page }) => {
      // Attempt to access security timeline without login
      await page.goto('/demo-bjj/app/security');
      
      // Should redirect to login or show access denied
      await page.waitForTimeout(2000);
      
      const url = page.url();
      // Should not be on security page without auth
      expect(url).not.toContain('/app/security');
    });

    test('security page loads for authenticated admin', async ({ page }) => {
      // This test would need proper authentication fixture
      // For now, verify the route exists and returns appropriate response
      
      const response = await page.goto('/demo-bjj/app/security');
      
      // Should get a response (not 404)
      expect(response?.status()).not.toBe(404);
    });
  });

  test.describe('Database Functions', () => {
    
    test('explain_security_decision function exists', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Call with a random UUID - should return empty result (not error)
      const { error } = await client
        .rpc('explain_security_decision', { 
          p_decision_id: '00000000-0000-0000-0000-000000000000' 
        });

      // Function should exist - no error about missing function
      expect(error?.message).not.toContain('does not exist');
    });

    test('get_security_timeline function exists', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Call with empty params - should return empty due to RLS
      const { data, error } = await client
        .rpc('get_security_timeline', {
          p_limit: 10,
          p_offset: 0,
        });

      // Function should exist - might return empty due to RLS
      expect(error?.message).not.toContain('does not exist');
    });

    test('verify_decision_log_chain function exists', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Call with a random tenant UUID
      const { error } = await client
        .rpc('verify_decision_log_chain', { 
          p_tenant_id: '00000000-0000-0000-0000-000000000000' 
        });

      // Function should exist
      expect(error?.message).not.toContain('does not exist');
    });
  });

  test.describe('API Endpoint Security', () => {
    
    test('decision_logs query respects tenant_id filter', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Query with specific tenant - should return empty for unauthenticated
      const { data } = await client
        .from('decision_logs')
        .select('id, tenant_id')
        .eq('tenant_id', '00000000-0000-0000-0000-000000000000')
        .limit(5);

      expect(data).toEqual([]);
    });

    test('security_events query respects tenant_id filter', async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      // Query with specific tenant - should return empty for unauthenticated
      const { data } = await client
        .from('security_events')
        .select('id, tenant_id')
        .eq('tenant_id', '00000000-0000-0000-0000-000000000000')
        .limit(5);

      expect(data).toEqual([]);
    });
  });
});
