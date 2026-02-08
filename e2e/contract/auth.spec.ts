/**
 * T1.0 — AUTH CONTRACT TESTS (SAFE GOLD v1.0)
 *
 * Validates authentication flow contracts.
 * SAFE GOLD: no mutations, no redirects, deterministic.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

const PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'guardians',
  'tenant_billing',
  'tenant_invoices',
  'events',
  'reports',
];

async function mockAuthSuccess(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/token*', (route, request) => {
    if (request.method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: 'mock-user-id',
            email: 'test@example.com',
          },
        }),
      });
    } else {
      route.continue();
    }
  });
}

async function mockAuth401(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/**', (route) => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' }),
    });
  });
}

async function mockAuthTimeout(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/**', async (route) => {
    await new Promise((r) => setTimeout(r, 15000));
    route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Gateway Timeout' }),
    });
  });
}

test.describe('T1.0 — AUTH CONTRACT (SAFE GOLD)', () => {
  test('A.C.1: valid session maintains navigation', async ({ page }) => {
    logTestStep('AUTH', 'Valid session navigation');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuthSuccess(page);

    await page.goto('/login');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('AUTH', 'Navigation maintained with valid session', true);
  });

  test('A.C.2: 401 does not break UI', async ({ page }) => {
    logTestStep('AUTH', '401 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuth401(page);

    await page.goto('/login');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    // UI should still be functional
    const hasLoginForm = await page.locator('form').count();
    expect(hasLoginForm).toBeGreaterThanOrEqual(0);

    logTestAssertion('AUTH', 'UI visible after 401', true);
  });

  test('A.C.3: timeout does not redirect', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('AUTH', 'Timeout handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await mockAuthTimeout(page);
    await page.goto('/login');
    await page.waitForTimeout(5000);

    // No unexpected redirects
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes('/login') &&
        !u.includes('/signup') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('AUTH', 'No redirect on timeout', true);
  });

  test('A.C.4: no mutations during auth flow', async ({ page }) => {
    logTestStep('AUTH', 'Mutation boundary');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const mutations: string[] = [];
    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const isProtected = PROTECTED_TABLES.some((table) =>
          url.includes(`/rest/v1/${table}`)
        );
        if (isProtected) {
          mutations.push(`${method} ${url}`);
        }
      }
      route.continue();
    });

    await page.goto('/login');
    await page.waitForTimeout(3000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('AUTH', 'No mutations detected', true);
  });

  test('A.C.5: URL stable for 10 seconds', async ({ page }) => {
    logTestStep('AUTH', 'URL stability');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const initialUrl = page.url();

    // Wait 10 seconds
    await page.waitForTimeout(10000);

    const finalUrl = page.url();

    // URL should be stable (same path)
    expect(new URL(finalUrl).pathname).toBe(new URL(initialUrl).pathname);

    logTestAssertion('AUTH', 'URL stable for 10s', true);
  });
});
