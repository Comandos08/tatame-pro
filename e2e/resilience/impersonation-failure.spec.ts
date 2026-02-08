/**
 * PI I1.0 — IMPERSONATION SAFE GOLD v1.0 — Resilience Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate graceful degradation when impersonation endpoints fail.
 *
 * CONTRACTS:
 * - I.R.1: 403 error — UI stays visible
 * - I.R.2: 500 error — UI stays visible
 * - I.R.3: Timeout (15s) — UI stays visible
 * - I.R.4: Invalid JSON — UI stays visible
 * - I.R.5: Mixed failures — UI stays visible
 * - I.R.6: No redirects during failures
 *
 * SAFE GOLD: Failures must NEVER cause white-screen or forced redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsSuperAdmin } from '../fixtures/auth.fixture';
import { mockImpersonationFailure } from '../helpers/mock-impersonation';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('I.R — Impersonation Resilience', () => {
  test('I.R.1: 403 error — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing 403 response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationFailure(page, '403');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // App shell should still be visible
    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible({ timeout: 10000 });

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('I.R.2: 500 error — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing 500 response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible({ timeout: 10000 });

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('I.R.3: Timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000); // Extend timeout for this test
    logTestStep('RESILIENCE', 'Testing timeout response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationFailure(page, 'timeout');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);

    // Wait for page to stabilize even with timeouts
    await page.waitForTimeout(5000);

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible({ timeout: 20000 });

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('I.R.4: Invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing invalid JSON response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationFailure(page, 'invalid-json');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible({ timeout: 10000 });

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('I.R.5: Mixed failures — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing mixed failure scenarios');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Alternate between different failure types
    let failureCount = 0;
    await page.route('**/*', async (route, request) => {
      const url = request.url();
      if (!url.toLowerCase().includes('imperson')) {
        return route.continue();
      }

      failureCount++;
      const failureType = failureCount % 3;

      switch (failureType) {
        case 0:
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Forbidden' }),
          });
        case 1:
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Server Error' }),
          });
        case 2:
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{ broken json',
          });
        default:
          return route.continue();
      }
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible({ timeout: 10000 });

    logTestAssertion('RESILIENCE', 'UI visible after mixed failures', true);
  });

  test('I.R.6: No redirects during failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirects during failure handling');

    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url());
      }
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockImpersonationFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();

    // Wait 5 seconds to check for async redirects
    await page.waitForTimeout(5000);

    // Should still be on the same page
    expect(page.url()).toBe(stableUrl);

    // Check no unexpected redirects happened
    const unexpectedRedirects = navigations.filter(
      (url) =>
        !url.includes('/app') &&
        !url.includes('/login') &&
        !url.includes('/auth') &&
        !url.includes('about:blank')
    );
    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });
});
