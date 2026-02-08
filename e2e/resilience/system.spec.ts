/**
 * T1.0 — SYSTEM RESILIENCE TESTS (SAFE GOLD v1.0)
 *
 * Validates system-wide stability under failure conditions.
 * SAFE GOLD: no crashes, no redirects, UI always visible.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

async function mockAllFailures(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' }),
    });
  });

  await page.route('**/auth/v1/**', (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Auth Error' }),
    });
  });
}

async function mockHighLatency(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/**', async (route) => {
    await new Promise((r) => setTimeout(r, 8000)); // 8s delay
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function mockIntermittentFailures(page: import('@playwright/test').Page) {
  let requestCount = 0;

  await page.route('**/rest/v1/**', (route) => {
    requestCount++;
    // Fail every other request
    if (requestCount % 2 === 0) {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Intermittent Error' }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
  });
}

test.describe('T1.0 — SYSTEM RESILIENCE (SAFE GOLD)', () => {
  test('S.R.1: total backend failure — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Total failure handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAllFailures(page);

    await page.goto(`/${TENANT_SLUG}`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after total failure', true);
  });

  test('S.R.2: high latency — UI stays visible', async ({ page }) => {
    test.setTimeout(60000);
    logTestStep('RESILIENCE', 'High latency handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockHighLatency(page);

    await page.goto(`/${TENANT_SLUG}`);

    // UI should be visible immediately
    await expect(page.locator('body')).toBeVisible();

    // Wait for potential data load
    await page.waitForTimeout(10000);

    // UI should still be visible
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible during high latency', true);
  });

  test('S.R.3: intermittent failures — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Intermittent failure handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockIntermittentFailures(page);

    // Navigate to multiple routes
    const routes = [
      `/${TENANT_SLUG}`,
      `/${TENANT_SLUG}/events`,
      `/login`,
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(1500);
      await expect(page.locator('body')).toBeVisible();
    }

    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible during intermittent failures', true);
  });

  test('S.R.4: no redirect under system-wide failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect check');

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAllFailures(page);

    await page.goto(`/${TENANT_SLUG}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Filter out expected navigations
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes(`/${TENANT_SLUG}`) &&
        !u.includes('/login') &&
        !u.includes('/signup') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });

  test('S.R.5: cascading navigation under failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'Cascading navigation');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockAllFailures(page);

    // Rapid navigation
    const routes = [
      `/${TENANT_SLUG}`,
      `/${TENANT_SLUG}/events`,
      `/${TENANT_SLUG}/membership/new`,
      `/login`,
      `/${TENANT_SLUG}`,
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(500); // Fast navigation
    }

    // Wait for stabilization
    await page.waitForTimeout(3000);

    // UI should still be visible
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'Survived cascading navigation', true);
  });

  test('S.R.6: recovery after failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'Recovery handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Start with failure
    await mockAllFailures(page);
    await page.goto(`/${TENANT_SLUG}`);
    await page.waitForTimeout(2000);

    // UI should be visible even in failure
    await expect(page.locator('body')).toBeVisible();

    // Clear routes and mock success
    await page.unrouteAll();
    await page.route('**/rest/v1/tenants*', (route, request) => {
      if (request.method() !== 'GET') return route.continue();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tenant-safe-gold-01',
            name: 'Test Federation',
            slug: TENANT_SLUG,
            is_active: true,
          },
        ]),
      });
    });

    // Navigate again
    await page.goto(`/${TENANT_SLUG}`);
    await page.waitForTimeout(2000);

    // UI should still be visible
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'Recovered after failure', true);
  });
});
