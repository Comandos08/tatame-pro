/**
 * T1.0 — BILLING GLOBAL RESILIENCE TESTS (SAFE GOLD v1.0)
 *
 * Validates billing stability under failure conditions.
 * SAFE GOLD: no crashes, no redirects, UI always visible.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

async function mockBillingFailure(
  page: import('@playwright/test').Page,
  type: '403' | '500' | 'timeout' | 'invalid-json'
) {
  await page.route('**/rest/v1/tenant_billing*', async (route) => {
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

test.describe('T1.0 — BILLING GLOBAL RESILIENCE (SAFE GOLD)', () => {
  test('BILLING.R.1: 403 → UI viva', async ({ page }) => {
    logTestStep('BILLING', '403 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, '403');

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('BILLING', 'UI visible after 403', true);
  });

  test('BILLING.R.2: 500 → UI viva', async ({ page }) => {
    logTestStep('BILLING', '500 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, '500');

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('BILLING', 'UI visible after 500', true);
  });

  test('BILLING.R.3: timeout → UI viva', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('BILLING', 'Timeout handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, 'timeout');

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('BILLING', 'UI visible after timeout', true);
  });

  test('BILLING.R.4: invalid JSON → UI viva', async ({ page }) => {
    logTestStep('BILLING', 'Invalid JSON handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingFailure(page, 'invalid-json');

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('BILLING', 'UI visible after invalid JSON', true);
  });

  test('BILLING.R.5: portal indisponível ≠ redirect', async ({ page }) => {
    logTestStep('BILLING', 'Portal unavailable does not redirect');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await mockBillingFailure(page, '500');

    // Also mock Stripe portal failure
    await page.route('**/functions/v1/tenant-customer-portal*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Portal unavailable' }),
      });
    });

    await page.goto('/test-tenant/app/billing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Filter expected navigations
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes('/test-tenant/app') &&
        !u.includes('/login') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('BILLING', 'No redirect on portal failure', true);
  });

  test('BILLING.R.6: chained failures → UI stable', async ({ page }) => {
    logTestStep('BILLING', 'Chained failures handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock multiple billing-related failures
    await mockBillingFailure(page, '500');

    await page.route('**/rest/v1/tenant_invoices*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.route('**/functions/v1/tenant-customer-portal*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Portal unavailable' }),
      });
    });

    await page.goto('/test-tenant/app/billing');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('BILLING', 'UI stable after chained failures', true);
  });
});
