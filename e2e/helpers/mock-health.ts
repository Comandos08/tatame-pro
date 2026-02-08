/**
 * PI HEALTH1.0 — SYSTEM HEALTH SAFE GOLD — E2E Mock Helpers
 *
 * Deterministic mocks for System Health endpoints.
 * No Date.now() or new Date().
 */

import type { Page } from '@playwright/test';

// ============================================
// FIXED VALUES (DETERMINISTIC)
// ============================================

export const FIXED_TIMESTAMP_ISO = '2026-02-08T12:00:00.000Z';

export const FIXED_IDS = {
  SUPERADMIN_ID: 'superadmin_health_01',
  TENANT_ADMIN_ID: 'tenant_admin_health_01',
};

export const FIXED_HEALTH_PAYLOAD = {
  overall: 'OK',
  checks: [
    { name: 'Background Jobs', status: 'OK', reason: '3 jobs running normally' },
    { name: 'Critical Events', status: 'OK', reason: 'No critical events in last 24h' },
  ],
  summary: {
    ok: 2,
    degraded: 0,
    critical: 0,
  },
  updatedAt: FIXED_TIMESTAMP_ISO,
};

// ============================================
// PROTECTED TABLES (NO MUTATIONS)
// ============================================

export const HEALTH_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'tenant_billing',
  'audit_logs',
  'memberships',
  'events',
] as const;

// ============================================
// MOCK CONFIGURATION
// ============================================

export interface MockHealthConfig {
  status?: 'OK' | 'DEGRADED' | 'CRITICAL';
  emptyData?: boolean;
  simulateError?: boolean;
}

// ============================================
// UNIVERSAL MOCK (SUCCESS/EMPTY/ERROR)
// ============================================

export async function mockHealthUniversal(
  page: Page,
  opts: MockHealthConfig = {}
) {
  const { status = 'OK', emptyData, simulateError } = opts;

  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') return route.continue();

    // Mock job_execution_summary
    if (url.includes('/rest/v1/job_execution_summary')) {
      if (simulateError) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Jobs query failed' }),
        });
      }

      if (emptyData) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            job_name: 'expire-memberships',
            last_run_at: FIXED_TIMESTAMP_ISO,
            last_success_at: FIXED_TIMESTAMP_ISO,
            last_failure_at: null,
            runs_24h: 24,
            success_24h: 24,
            failures_24h: 0,
            items_processed_24h: 5,
            runs_7d: 168,
            items_processed_7d: 35,
          },
          {
            job_name: 'send-renewal-reminders',
            last_run_at: FIXED_TIMESTAMP_ISO,
            last_success_at: FIXED_TIMESTAMP_ISO,
            last_failure_at: null,
            runs_24h: 24,
            success_24h: 24,
            failures_24h: 0,
            items_processed_24h: 12,
            runs_7d: 168,
            items_processed_7d: 84,
          },
        ]),
      });
    }

    // Mock observability_critical_events
    if (url.includes('/rest/v1/observability_critical_events')) {
      if (simulateError) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Events query failed' }),
        });
      }

      if (status === 'CRITICAL') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'event_01',
              source: 'billing',
              event_type: 'TENANT_PAYMENT_FAILED',
              category: 'BILLING',
              tenant_id: 'tenant_01',
              created_at: FIXED_TIMESTAMP_ISO,
              severity: 'HIGH',
            },
          ]),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    // Mock tenant_billing for health metrics
    if (url.includes('/rest/v1/tenant_billing')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { status: 'ACTIVE' },
          { status: 'ACTIVE' },
          { status: 'TRIALING' },
        ]),
      });
    }

    // Mock memberships for health metrics
    if (url.includes('/rest/v1/memberships')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-9/100' },
        body: JSON.stringify([]),
      });
    }

    return route.continue();
  });
}

// ============================================
// FAILURE MOCKS (RESILIENCE TESTING)
// ============================================

export type FailureType = '403' | '500' | 'timeout' | 'invalid-json';

export async function mockHealthFailure(page: Page, type: FailureType) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    if (method !== 'GET') return route.continue();

    const isHealthEndpoint =
      url.includes('/rest/v1/job_execution_summary') ||
      url.includes('/rest/v1/observability_critical_events') ||
      url.includes('/rest/v1/tenant_billing') ||
      url.includes('/rest/v1/memberships');

    if (!isHealthEndpoint) return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden', message: 'Health access denied' }),
        });

      case '500':
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });

      case 'timeout':
        await new Promise((r) => setTimeout(r, 15000));
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway Timeout' }),
        });

      case 'invalid-json':
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{ invalid json health [[',
        });

      default:
        return route.continue();
    }
  });
}

// ============================================
// MUTATION TRACKING
// ============================================

export async function trackHealthMutations(page: Page): Promise<() => string[]> {
  const mutations: string[] = [];

  await page.route('**/rest/v1/**', (route, request) => {
    const method = request.method();
    const url = request.url();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      for (const table of HEALTH_PROTECTED_TABLES) {
        if (url.includes(`/rest/v1/${table}`)) {
          mutations.push(`${method} ${table}`);
        }
      }
    }
    route.continue();
  });

  return () => mutations;
}

// ============================================
// DETERMINISTIC GENERATORS
// ============================================

export function generateDeterministicHealth() {
  return { ...FIXED_HEALTH_PAYLOAD };
}
