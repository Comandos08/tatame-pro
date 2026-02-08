/**
 * PI A1.0 — ADMIN CONSOLE SAFE GOLD v1.0 — E2E Mock Helper
 *
 * Deterministic mocks for admin console endpoints.
 * RULES:
 * - No Date.now() / new Date()
 * - Fixed IDs and timestamps only
 * - Only intercepts GET requests for mocks
 * - Non-GET requests pass through for mutation boundary testing
 */

import type { Page } from '@playwright/test';

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

export const FIXED_IDS = {
  TENANT_ID: 'tenant_safe_gold_01',
  PROFILE_ID: 'profile_safe_gold_01',
  USER_ID: 'user_safe_gold_01',
  ROLE_ID: 'role_safe_gold_01',
};

export type MockAdminRole = 'SUPERADMIN_GLOBAL' | 'ADMIN_TENANT' | 'NONE';

/**
 * Universal admin console mock that intercepts core REST endpoints.
 * Only mocks GET requests. Mutations pass through for boundary testing.
 */
export async function mockAdminConsoleUniversal(
  page: Page,
  mock: { role?: MockAdminRole; tenantSlug?: string } = {}
) {
  const role = mock.role ?? 'SUPERADMIN_GLOBAL';
  const tenantSlug = mock.tenantSlug ?? 'demo';

  await page.route('**/rest/v1/**', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') return route.continue();

    // user_roles
    if (url.includes('/rest/v1/user_roles')) {
      const data =
        role === 'NONE'
          ? []
          : [{
              id: FIXED_IDS.ROLE_ID,
              user_id: FIXED_IDS.USER_ID,
              role,
              tenant_id: role === 'ADMIN_TENANT' ? FIXED_IDS.TENANT_ID : null,
              created_at: FIXED_TIMESTAMP_ISO,
              updated_at: FIXED_TIMESTAMP_ISO,
            }];

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    }

    // profiles
    if (url.includes('/rest/v1/profiles')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.PROFILE_ID,
          user_id: FIXED_IDS.USER_ID,
          tenant_id: role === 'ADMIN_TENANT' ? FIXED_IDS.TENANT_ID : null,
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    // tenants
    if (url.includes('/rest/v1/tenants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.TENANT_ID,
          slug: tenantSlug,
          name: 'SAFE GOLD Tenant',
          status: 'ACTIVE',
          is_active: true,
          onboarding_completed: true,
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    return route.continue();
  });
}

/**
 * Mock admin console endpoint failures for resilience testing.
 */
export async function mockAdminConsoleFailure(
  page: Page,
  type: '403' | '500' | 'timeout' | 'invalid-json'
) {
  await page.route('**/rest/v1/**', async (route, request) => {
    const url = request.url();
    if (
      !url.includes('/rest/v1/user_roles') &&
      !url.includes('/rest/v1/profiles') &&
      !url.includes('/rest/v1/tenants')
    ) {
      return route.continue();
    }

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
          body: '{ invalid json here',
        });
      default:
        return route.continue();
    }
  });
}
