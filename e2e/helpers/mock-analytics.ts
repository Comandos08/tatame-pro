/**
 * PI ANALYTICS2.0 — ANALYTICS SAFE GOLD — E2E Mock Helpers
 *
 * Deterministic mocks for Analytics endpoints.
 * No Date.now() or new Date().
 */

import type { Page } from '@playwright/test';

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

export const FIXED_IDS = {
  TENANT_ID: 'tenant_analytics_01',
  ANALYTICS_ID: 'analytics_01',
  USER_ID: 'user_analytics_01',
};

/**
 * ANALYTICS2.0: Protected tables — NO mutations allowed during analytics operations
 */
export const ANALYTICS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'memberships',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
] as const;

/**
 * SAFE GOLD Analytics Metrics
 */
export const SAFE_ANALYTICS_METRICS = [
  'TOTAL_ATHLETES',
  'ACTIVE_MEMBERSHIPS',
  'EXPIRED_MEMBERSHIPS',
  'REVENUE_TOTAL',
  'REVENUE_MRR',
  'EVENTS_COUNT',
  'EVENTS_ACTIVE',
] as const;

/**
 * Deterministic analytics payload for idempotency testing
 */
export const FIXED_ANALYTICS_PAYLOAD = {
  generated_at: FIXED_TIMESTAMP_ISO,
  tenant_id: FIXED_IDS.TENANT_ID,
  metrics: {
    TOTAL_ATHLETES: 150,
    ACTIVE_MEMBERSHIPS: 120,
    EXPIRED_MEMBERSHIPS: 30,
    REVENUE_TOTAL: 45000_00, // cents
    REVENUE_MRR: 3750_00, // cents
    EVENTS_COUNT: 12,
    EVENTS_ACTIVE: 3,
  },
};

interface MockAnalyticsConfig {
  tenantSlug?: string;
  emptyData?: boolean;
  partialData?: boolean;
  simulateError?: boolean;
}

/**
 * Mock analytics endpoints with deterministic values.
 */
export async function mockAnalyticsUniversal(
  page: Page,
  config: MockAnalyticsConfig = {}
) {
  const tenantSlug = config.tenantSlug ?? 'test-tenant';
  const emptyData = config.emptyData ?? false;
  const partialData = config.partialData ?? false;
  const simulateError = config.simulateError ?? false;

  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests for analytics
    if (method !== 'GET') return route.continue();

    // Mock analytics endpoint
    if (url.includes('/analytics') || url.includes('/metrics') || url.includes('/stats')) {
      if (simulateError) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Analytics failed' }),
        });
      }

      if (emptyData) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            generated_at: FIXED_TIMESTAMP_ISO,
            tenant_id: FIXED_IDS.TENANT_ID,
            metrics: {},
          }),
        });
      }

      if (partialData) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            generated_at: FIXED_TIMESTAMP_ISO,
            tenant_id: FIXED_IDS.TENANT_ID,
            partial: true,
            metrics: {
              TOTAL_ATHLETES: 150,
              ACTIVE_MEMBERSHIPS: 120,
            },
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FIXED_ANALYTICS_PAYLOAD),
      });
    }

    // Mock dashboard data
    if (url.includes('/dashboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...FIXED_ANALYTICS_PAYLOAD,
          charts: {
            memberships_trend: [
              { month: '2026-01', count: 100 },
              { month: '2026-02', count: 120 },
            ],
          },
        }),
      });
    }

    // Mock tenants for context
    if (url.includes('/rest/v1/tenants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.TENANT_ID,
          slug: tenantSlug,
          name: 'SAFE GOLD Analytics Tenant',
          status: 'ACTIVE',
          is_active: true,
          onboarding_completed: true,
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    // Mock athletes count
    if (url.includes('/rest/v1/athletes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': '0-149/150',
        },
        body: JSON.stringify([]),
      });
    }

    // Mock memberships count
    if (url.includes('/rest/v1/memberships')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': '0-119/120',
        },
        body: JSON.stringify([]),
      });
    }

    return route.continue();
  });
}

type FailureType = '403' | '500' | 'timeout' | 'invalid-json';

/**
 * Mock analytics failures for resilience testing.
 */
export async function mockAnalyticsFailure(
  page: Page,
  type: FailureType
) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // Only intercept GET requests to analytics-related endpoints
    if (method !== 'GET') return route.continue();

    const isAnalyticsEndpoint =
      url.includes('/analytics') ||
      url.includes('/metrics') ||
      url.includes('/stats') ||
      url.includes('/dashboard') ||
      (url.includes('/functions/v1') && url.toLowerCase().includes('analytics'));

    if (!isAnalyticsEndpoint) return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden', message: 'Analytics access denied' }),
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
          body: '{ invalid json analytics [[',
        });

      default:
        return route.continue();
    }
  });
}

/**
 * ANALYTICS2.0: Track mutations to protected tables during test execution.
 * Returns a function to get captured mutations.
 */
export async function trackAnalyticsMutations(page: Page): Promise<() => string[]> {
  const mutations: string[] = [];

  await page.route('**/rest/v1/**', (route, request) => {
    const method = request.method();
    const url = request.url();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      for (const table of ANALYTICS_PROTECTED_TABLES) {
        if (url.includes(`/rest/v1/${table}`)) {
          mutations.push(`${method} ${table}`);
        }
      }
    }
    route.continue();
  });

  return () => mutations;
}

/**
 * Generate deterministic analytics for idempotency testing.
 * Same inputs ALWAYS produce same outputs.
 */
export function generateDeterministicAnalytics(): typeof FIXED_ANALYTICS_PAYLOAD {
  // Always return the same payload - no randomness
  return { ...FIXED_ANALYTICS_PAYLOAD };
}
