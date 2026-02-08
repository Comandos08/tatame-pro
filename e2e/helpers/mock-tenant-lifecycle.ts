/**
 * PI T1.0 — TENANT LIFECYCLE SAFE GOLD v1.0 — E2E Mock Helper
 *
 * Deterministic mocks for tenant lifecycle endpoints.
 * RULES:
 * - No Date.now() / new Date()
 * - Fixed IDs and timestamps only
 * - Only intercepts GET requests for mocks
 * - Non-GET requests pass through for mutation boundary testing
 */

import type { Page } from '@playwright/test';

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

export const FIXED_IDS = {
  TENANT_ID: 'tenant_lifecycle_01',
  TENANT_SLUG: 'test-tenant',
  TENANT_NAME: 'Test Organization',
};

export type TenantLifecycleMockState = 'SETUP' | 'ACTIVE' | 'BLOCKED' | 'DELETED';

/**
 * Mock tenant lifecycle state for E2E testing.
 * Only mocks GET requests. Mutations pass through for boundary testing.
 */
export async function mockTenantLifecycle(
  page: Page,
  state: TenantLifecycleMockState,
  options: {
    tenantId?: string;
    tenantSlug?: string;
    tenantName?: string;
  } = {}
) {
  const tenantId = options.tenantId ?? FIXED_IDS.TENANT_ID;
  const tenantSlug = options.tenantSlug ?? FIXED_IDS.TENANT_SLUG;
  const tenantName = options.tenantName ?? FIXED_IDS.TENANT_NAME;

  await page.route('**/rest/v1/tenants*', async (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: tenantId,
        slug: tenantSlug,
        name: tenantName,
        status: state,
        is_active: state === 'ACTIVE',
        onboarding_completed: state !== 'SETUP',
        created_at: FIXED_TIMESTAMP_ISO,
        updated_at: FIXED_TIMESTAMP_ISO,
      }]),
    });
  });
}

/**
 * Mock tenant endpoint failures for resilience testing.
 */
export async function mockTenantLifecycleFailure(
  page: Page,
  type: '403' | '500' | 'timeout' | 'invalid-json'
) {
  await page.route('**/rest/v1/tenants*', async (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden' }),
        });

      case '500':
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });

      case 'timeout':
        await new Promise((resolve) => setTimeout(resolve, 15000));
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway Timeout' }),
        });

      case 'invalid-json':
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{ invalid json here',
        });

      default:
        return route.continue();
    }
  });
}
