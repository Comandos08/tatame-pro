/**
 * PI R1.0 + REPORTS1.0 — REPORTS SAFE GOLD — Resilience Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate graceful degradation when reports endpoints fail.
 *
 * CONTRACTS:
 * - REP.R.1: 403 error — UI stays visible
 * - REP.R.2: 500 error — UI stays visible
 * - REP.R.3: Timeout — UI stays visible
 * - REP.R.4: Invalid JSON — UI stays visible
 * - REP.R.5: Mixed failures — UI stays visible
 * - REP.R.6: No unexpected redirects during failures
 * - REP.R.7: Partial data ≠ visual regression
 * - REP.R.8: Loop detection (navigation ratio < 5)
 *
 * SAFE GOLD: Failures must NEVER cause white-screen or forced redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { mockReportsFailure, mockReportsUniversal } from '../helpers/mock-reports';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('REPORTS1.0 — Reports SAFE GOLD (Resilience)', () => {
  test('REP.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsFailure(page, '403');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('REP.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('REP.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'timeout handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsFailure(page, 'timeout');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('REP.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'invalid JSON handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsFailure(page, 'invalid-json');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('REP.R.5: mixed failures — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'mixed failures handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // First request fails with 403, subsequent with 500
    let requestCount = 0;
    await page.route('**/*', async (route, request) => {
      const url = request.url();
      const method = request.method();

      if (method !== 'GET') return route.continue();

      const isReportsEndpoint =
        url.includes('/rest/v1/reports') ||
        (url.includes('/functions/v1') && url.toLowerCase().includes('report'));

      if (!isReportsEndpoint) return route.continue();

      requestCount++;
      if (requestCount % 2 === 1) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden' }),
        });
      } else {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      }
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after mixed failures', true);
  });

  test('REP.R.6: no unexpected redirects during failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'no redirect during failure');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();
    await page.waitForTimeout(5000);

    // Should not redirect to unexpected locations
    const unexpected = nav.filter(
      (u) =>
        !u.includes('/app') &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('/portal') &&
        !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    // Should still be on app or valid authenticated route
    const finalUrl = page.url();
    const isValidRoute =
      finalUrl.includes('/app') ||
      finalUrl.includes('/portal') ||
      finalUrl.includes('/login');
    expect(isValidRoute).toBe(true);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });

  test('REP.R.7: partial data ≠ visual regression', async ({ page }) => {
    logTestStep('RESILIENCE', 'partial data handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsUniversal(page, { 
      type: 'OVERVIEW', 
      scope: 'TENANT', 
      tenantSlug: TENANT_SLUG,
      partialData: true 
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Page should still be visible and functional
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    // AppShell should be visible
    const appShell = page.locator('[data-testid="app-shell"]');
    await expect(appShell).toBeVisible();

    logTestAssertion('RESILIENCE', 'Partial data handled gracefully', true);
  });

  test('REP.R.8: loop detection (navigation ratio < 5)', async ({ page }) => {
    logTestStep('RESILIENCE', 'loop detection');

    const navEvents: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navEvents.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockReportsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(10000);

    // Calculate navigation density (navigations per second)
    // Should be < 5 navigations in 10 seconds (0.5/s threshold)
    // More than 5 indicates a redirect loop
    const navCount = navEvents.length;
    const ratio = navCount / 10; // navigations per second

    expect(ratio).toBeLessThan(0.5);
    logTestAssertion('RESILIENCE', `Loop detection passed (ratio: ${ratio.toFixed(2)})`, true);
  });

  test('REP.R.9: continuous navigation after recovery', async ({ page }) => {
    logTestStep('RESILIENCE', 'post-failure navigation');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Start with failure
    let shouldFail = true;
    await page.route('**/rest/v1/reports**', (route) => {
      if (shouldFail) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(2000);

    // UI should be visible despite failure
    await expect(page.locator('body')).toBeVisible();

    // Simulate recovery
    shouldFail = false;

    // Navigate to another page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be functional
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'Navigation continues after recovery', true);
  });
});
