/**
 * PI I1.0 — IMPERSONATION SAFE GOLD v1.0 — E2E Mock Helper
 *
 * Deterministic mocks for impersonation endpoints.
 * RULES:
 * - No Date.now() / new Date()
 * - Fixed IDs and timestamps only
 * - Only intercepts GET requests for mocks
 * - Non-GET requests pass through for mutation boundary testing
 */

import type { Page } from '@playwright/test';

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

export const FIXED_IDS = {
  ADMIN_USER_ID: 'user_admin_01',
  TARGET_USER_ID: 'user_target_01',
  TENANT_ID: 'tenant_test_01',
  SESSION_ID: 'imp_session_01',
};

export type MockImpersonation = {
  enabled: boolean;
  adminUserId?: string;
  targetUserId?: string;
  tenantId?: string;
};

/**
 * Universal impersonation mock that intercepts:
 * 1. Edge Functions containing "imperson" in URL
 * 2. REST tables containing "imperson" in URL
 *
 * Only mocks GET requests. Mutations pass through for contract testing.
 */
export async function mockImpersonationUniversal(page: Page, mock: MockImpersonation) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    const method = request.method();

    // Only handle GET for mocks — let mutations pass for boundary testing
    if (method !== 'GET') return route.continue();

    // 1) Edge Functions pattern
    if (url.includes('/functions/v1') && url.toLowerCase().includes('imperson')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: FIXED_IDS.SESSION_ID,
          is_active: mock.enabled,
          admin_user_id: mock.adminUserId ?? FIXED_IDS.ADMIN_USER_ID,
          target_user_id: mock.targetUserId ?? FIXED_IDS.TARGET_USER_ID,
          tenant_id: mock.tenantId ?? FIXED_IDS.TENANT_ID,
          created_at: FIXED_TIMESTAMP_ISO,
        }),
      });
    }

    // 2) REST tables pattern (superadmin_impersonations or similar)
    if (url.includes('/rest/v1/') && url.toLowerCase().includes('imperson')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: FIXED_IDS.SESSION_ID,
          is_active: mock.enabled,
          superadmin_user_id: mock.adminUserId ?? FIXED_IDS.ADMIN_USER_ID,
          target_tenant_id: mock.tenantId ?? FIXED_IDS.TENANT_ID,
          status: mock.enabled ? 'ACTIVE' : 'ENDED',
          created_at: FIXED_TIMESTAMP_ISO,
          updated_at: FIXED_TIMESTAMP_ISO,
          expires_at: FIXED_TIMESTAMP_ISO,
        }]),
      });
    }

    return route.continue();
  });
}

/**
 * Mock impersonation endpoint failures for resilience testing.
 */
export async function mockImpersonationFailure(
  page: Page,
  type: '403' | '500' | 'timeout' | 'invalid-json'
) {
  await page.route('**/*', async (route, request) => {
    const url = request.url();

    // Only target impersonation endpoints
    if (!url.toLowerCase().includes('imperson')) {
      return route.continue();
    }

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
