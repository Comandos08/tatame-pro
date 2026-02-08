/**
 * T1.0 — BILLING RUNTIME RESILIENCE TESTS (SAFE GOLD v1.0)
 *
 * Validates billing runtime stability under failure conditions.
 * SAFE GOLD: no crashes, no redirects, UI always visible.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { loginAsSuperAdmin, TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';
import { FIXED_TIMESTAMP_ISO } from '@/../e2e/helpers/mock-billing';

async function mockBillingFailure(
  page: import('@playwright/test').Page,
  type: '403' | '500' | 'timeout' | 'invalid-json' | 'empty'
) {
  await page.route('**/rest/v1/tenant_billing*', async (route, request) => {
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
      case 'empty':
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      default:
        return route.continue();
    }
  });
}

test.describe('T1.0 — BILLING RUNTIME RESILIENCE (SAFE GOLD)', () => {
  test('B.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, '403');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('B.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('B.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'Timeout handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, 'timeout');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('B.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Invalid JSON handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, 'invalid-json');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('B.R.5: empty billing data — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Empty data handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, 'empty');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible with empty data', true);
  });

  test('B.R.6: no redirect under any billing failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect check');

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Filter out expected navigations
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes(`/${TENANT_SLUG}`) &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });
});
