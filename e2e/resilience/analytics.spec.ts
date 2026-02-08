/**
 * PI ANALYTICS2.0 — ANALYTICS SAFE GOLD — Resilience Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate graceful degradation when analytics endpoints fail.
 *
 * CONTRACTS:
 * - AN.R.1: 403 error — UI stays visible
 * - AN.R.2: 500 error — UI stays visible
 * - AN.R.3: Timeout — UI stays visible
 * - AN.R.4: Invalid JSON — UI stays visible
 * - AN.R.5: Partial data ≠ crash
 * - AN.R.6: Loop detection (navigation ratio < 0.5/s)
 *
 * SAFE GOLD: Analytics failures must NEVER cause white-screen or forced redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { mockAnalyticsFailure, mockAnalyticsUniversal } from '../helpers/mock-analytics';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('ANALYTICS2.0 — Analytics SAFE GOLD (Resilience)', () => {
  test('AN.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Analytics 403 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsFailure(page, '403');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after analytics 403', true);
  });

  test('AN.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Analytics 500 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after analytics 500', true);
  });

  test('AN.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'Analytics timeout handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsFailure(page, 'timeout');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after analytics timeout', true);
  });

  test('AN.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Analytics invalid JSON handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsFailure(page, 'invalid-json');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after analytics invalid JSON', true);
  });

  test('AN.R.5: partial data ≠ crash', async ({ page }) => {
    logTestStep('RESILIENCE', 'Partial analytics data handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsUniversal(page, {
      tenantSlug: TENANT_SLUG,
      partialData: true,
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

    logTestAssertion('RESILIENCE', 'Partial analytics data handled gracefully', true);
  });

  test('AN.R.6: loop detection (navigation ratio < 0.5/s)', async ({ page }) => {
    logTestStep('RESILIENCE', 'Analytics loop detection');

    const navEvents: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navEvents.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(10000);

    // Calculate navigation density (navigations per second)
    const navCount = navEvents.length;
    const ratio = navCount / 10; // navigations per second

    expect(ratio).toBeLessThan(0.5);
    logTestAssertion('RESILIENCE', `Loop detection passed (ratio: ${ratio.toFixed(2)})`, true);
  });

  test('AN.R.7: recovery post-failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'Analytics post-failure recovery');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Start with failure
    let shouldFail = true;
    await page.route('**/analytics/**', (route) => {
      if (shouldFail) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Analytics failed' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ metrics: {} }),
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

    logTestAssertion('RESILIENCE', 'Navigation continues after analytics recovery', true);
  });

  test('AN.R.8: no unexpected redirects during analytics failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect during analytics failure');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockAnalyticsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

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

    logTestAssertion('RESILIENCE', 'No unexpected redirects during analytics failure', true);
  });
});
