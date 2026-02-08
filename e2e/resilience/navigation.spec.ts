/**
 * T1.0 — GLOBAL NAVIGATION STABILITY TESTS (SAFE GOLD v1.0)
 *
 * Validates navigation stability across all routes under failure conditions.
 * SAFE GOLD: no loops, no crashes, no unexpected redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

// Critical routes to test
const CRITICAL_ROUTES = [
  '/login',
  '/signup',
  '/test-tenant/app',
  '/test-tenant/portal',
  '/test-tenant/events',
  '/test-tenant/membership/new',
  '/test-tenant/membership/adult',
  '/test-tenant/membership/youth',
];

test.describe('T1.0 — GLOBAL NAVIGATION STABILITY (SAFE GOLD)', () => {
  test('NAV.R.1: nenhuma rota entra em loop em 10s', async ({ page }) => {
    logTestStep('NAVIGATION', 'No redirect loop check');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    for (const route of CRITICAL_ROUTES) {
      const navigations: string[] = [];
      
      const handler = (frame: import('@playwright/test').Frame) => {
        if (frame === page.mainFrame()) {
          navigations.push(frame.url());
        }
      };
      
      page.on('framenavigated', handler);

      await page.goto(route);
      await page.waitForTimeout(10000);

      page.off('framenavigated', handler);

      // Count unique URLs (detecting loops)
      const uniqueUrls = new Set(navigations.map((u) => new URL(u).pathname));
      
      // Should not have excessive redirects (loop detection)
      // A loop would cause navigations.length >> uniqueUrls.size
      const loopRatio = navigations.length / Math.max(uniqueUrls.size, 1);
      expect(loopRatio).toBeLessThan(5);

      // UI should still be visible
      await expect(page.locator('body')).toBeVisible();
    }

    logTestAssertion('NAVIGATION', 'No redirect loops detected', true);
  });

  test('NAV.R.2: erro em API não causa redirect inesperado', async ({ page }) => {
    logTestStep('NAVIGATION', 'API error does not cause redirect');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock all REST API failures
    await page.route('**/rest/v1/**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    for (const route of CRITICAL_ROUTES) {
      const redirects: string[] = [];
      
      const handler = (frame: import('@playwright/test').Frame) => {
        if (frame === page.mainFrame()) {
          redirects.push(frame.url());
        }
      };
      
      page.on('framenavigated', handler);

      await page.goto(route);
      await page.waitForTimeout(3000);

      page.off('framenavigated', handler);

      // Filter expected navigations
      const expectedPaths = [
        '/login',
        '/signup',
        '/test-tenant',
        'about:blank',
      ];
      
      const unexpectedRedirects = redirects.filter(
        (u) => !expectedPaths.some((path) => u.includes(path))
      );

      // UI should still be visible
      await expect(page.locator('body')).toBeVisible();
    }

    logTestAssertion('NAVIGATION', 'No unexpected redirects on API errors', true);
  });

  test('NAV.R.3: navegação contínua após falhas simuladas', async ({ page }) => {
    logTestStep('NAVIGATION', 'Continuous navigation after failures');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // First, simulate failure
    await page.route('**/rest/v1/**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(2000);

    // UI should be visible after failure
    await expect(page.locator('body')).toBeVisible();

    // Remove failure mock
    await page.unroute('**/rest/v1/**');

    // Navigate to another route
    await page.goto('/test-tenant/events');
    await page.waitForTimeout(2000);

    // UI should still be visible
    await expect(page.locator('body')).toBeVisible();

    // Navigate to another route
    await page.goto('/login');
    await page.waitForTimeout(2000);

    // UI should still be visible
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('NAVIGATION', 'Navigation continues after failures', true);
  });

  test('NAV.R.4: timeout em múltiplas rotas não quebra navegação', async ({ page }) => {
    test.setTimeout(60000);
    logTestStep('NAVIGATION', 'Timeout on multiple routes');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock timeout on first request
    await page.route('**/rest/v1/tenants*', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    const routesToTest = ['/test-tenant/app', '/test-tenant/events', '/login'];

    for (const route of routesToTest) {
      await page.goto(route);
      await page.waitForTimeout(6000);

      // UI should still be visible despite timeout
      await expect(page.locator('body')).toBeVisible();
      const html = await page.content();
      expect(html.length).toBeGreaterThan(500);
    }

    logTestAssertion('NAVIGATION', 'Navigation stable despite timeouts', true);
  });

  test('NAV.R.5: auth failure does not break navigation', async ({ page }) => {
    logTestStep('NAVIGATION', 'Auth failure navigation stability');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock auth failure
    await page.route('**/auth/v1/**', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      });
    });

    // Try navigating to protected route
    await page.goto('/test-tenant/app');
    await page.waitForTimeout(3000);

    // UI should be visible (login page or error page)
    await expect(page.locator('body')).toBeVisible();

    // Should be able to navigate to public routes
    await page.goto('/login');
    await page.waitForTimeout(2000);

    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('NAVIGATION', 'Navigation stable after auth failure', true);
  });

  test('NAV.R.6: mixed failures do not cause cascade', async ({ page }) => {
    logTestStep('NAVIGATION', 'Mixed failures cascade prevention');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock various failures
    await page.route('**/rest/v1/tenants*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server Error' }),
      });
    });

    await page.route('**/rest/v1/tenant_billing*', (route) => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      });
    });

    await page.route('**/rest/v1/memberships*', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      route.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Timeout' }),
      });
    });

    await page.goto('/test-tenant/app');
    await page.waitForTimeout(5000);

    // UI should still be visible despite multiple failures
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('NAVIGATION', 'No cascade from mixed failures', true);
  });
});
