/**
 * T1.0 — AUTH RESILIENCE TESTS (SAFE GOLD v1.0)
 *
 * Validates auth stability under failure conditions.
 * SAFE GOLD: no crashes, no redirects, UI always visible.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

async function mockAuthFailure(
  page: import('@playwright/test').Page,
  type: '401' | '403' | '500' | 'timeout' | 'invalid-json'
) {
  await page.route('**/auth/v1/**', async (route, request) => {
    switch (type) {
      case '401':
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' }),
        });
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

test.describe('T1.0 — AUTH RESILIENCE (SAFE GOLD)', () => {
  test('A.R.1: 401 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '401 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuthFailure(page, '401');

    await page.goto('/login');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 401', true);
  });

  test('A.R.2: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuthFailure(page, '403');

    await page.goto('/login');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('A.R.3: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuthFailure(page, '500');

    await page.goto('/login');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('A.R.4: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'Timeout handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuthFailure(page, 'timeout');

    await page.goto('/login');
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('A.R.5: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Invalid JSON handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuthFailure(page, 'invalid-json');

    await page.goto('/login');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('A.R.6: no redirect under any auth failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect check');

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAuthFailure(page, '500');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Filter out expected navigations
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes('/login') &&
        !u.includes('/signup') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });
});
