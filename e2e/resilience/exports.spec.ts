/**
 * PI EXPORTS1.0 — EXPORTS SAFE GOLD — Resilience Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate graceful degradation when export endpoints fail.
 *
 * CONTRACTS:
 * - EXPORT.R.1: 403 error — UI stays visible
 * - EXPORT.R.2: 500 error — UI stays visible
 * - EXPORT.R.3: Timeout — UI stays visible
 * - EXPORT.R.4: Invalid JSON — UI stays visible
 * - EXPORT.R.5: Loop detection (navigation ratio < 0.5/s)
 * - EXPORT.R.6: Recovery post-failure
 *
 * SAFE GOLD: Export failures must NEVER cause white-screen or forced redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { mockExportsFailure, mockExportsUniversal } from '../helpers/mock-exports';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('EXPORTS1.0 — Exports SAFE GOLD (Resilience)', () => {
  test('EXPORT.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Export 403 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsFailure(page, '403');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after export 403', true);
  });

  test('EXPORT.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Export 500 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after export 500', true);
  });

  test('EXPORT.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'Export timeout handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsFailure(page, 'timeout');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after export timeout', true);
  });

  test('EXPORT.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Export invalid JSON handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsFailure(page, 'invalid-json');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after export invalid JSON', true);
  });

  test('EXPORT.R.5: loop detection (navigation ratio < 0.5/s)', async ({ page }) => {
    logTestStep('RESILIENCE', 'Export loop detection');

    const navEvents: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navEvents.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(10000);

    // Calculate navigation density (navigations per second)
    const navCount = navEvents.length;
    const ratio = navCount / 10; // navigations per second

    expect(ratio).toBeLessThan(0.5);
    logTestAssertion('RESILIENCE', `Loop detection passed (ratio: ${ratio.toFixed(2)})`, true);
  });

  test('EXPORT.R.6: recovery post-failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'Export post-failure recovery');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Start with failure
    let shouldFail = true;
    await page.route('**/export/**', (route) => {
      if (shouldFail) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Export failed' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'id,name\n1,Test',
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

    logTestAssertion('RESILIENCE', 'Navigation continues after export recovery', true);
  });

  test('EXPORT.R.7: no unexpected redirects during export failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect during export failure');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsFailure(page, '500');

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

    logTestAssertion('RESILIENCE', 'No unexpected redirects during export failure', true);
  });

  test('EXPORT.R.8: partial export failure does NOT break UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Partial export failure handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockExportsUniversal(page, { 
      type: 'CSV', 
      tenantSlug: TENANT_SLUG,
      simulateError: true 
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

    logTestAssertion('RESILIENCE', 'Partial export failure handled gracefully', true);
  });
});
