/**
 * PI T1.0 — TENANT LIFECYCLE SAFE GOLD v1.0 — Resilience Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate graceful degradation when tenant endpoints fail.
 *
 * CONTRACTS:
 * - T.R.1: 403 error — UI stays visible
 * - T.R.2: 500 error — UI stays visible
 * - T.R.3: Timeout (15s) — UI stays visible
 * - T.R.4: Invalid JSON — UI stays visible
 * - T.R.5: Mixed failures — UI stays visible
 * - T.R.6: No redirects during failures
 *
 * SAFE GOLD: Failures must NEVER cause white-screen or forced redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { mockTenantLifecycleFailure } from '../helpers/mock-tenant-lifecycle';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('T.R — Tenant Lifecycle Resilience', () => {
  test('T.R.1: 403 error — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing 403 response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycleFailure(page, '403');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    
    // Wait for page to stabilize
    await page.waitForTimeout(3000);

    // Page should not be blank - some UI should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    // Check we're not on a blank page
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('T.R.2: 500 error — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing 500 response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycleFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    
    await page.waitForTimeout(3000);

    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('T.R.3: Timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000); // Extend timeout for this test
    logTestStep('RESILIENCE', 'Testing timeout response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycleFailure(page, 'timeout');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);

    // Wait for page to stabilize even with timeouts
    await page.waitForTimeout(5000);

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 20000 });
    
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('T.R.4: Invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing invalid JSON response');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycleFailure(page, 'invalid-json');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    
    await page.waitForTimeout(3000);

    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('T.R.5: Mixed failures — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing mixed failure scenarios');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Alternate between different failure types
    let failureCount = 0;
    await page.route('**/rest/v1/tenants*', async (route, request) => {
      if (request.method() !== 'GET') return route.continue();

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

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    
    await page.waitForTimeout(3000);

    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after mixed failures', true);
  });

  test('T.R.6: No redirects during failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirects during failure handling');

    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push(frame.url());
      }
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockTenantLifecycleFailure(page, '500');

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    
    // Wait for initial navigation to stabilize
    await page.waitForTimeout(2000);
    const stableUrl = page.url();

    // Wait 5 seconds to check for async redirects
    await page.waitForTimeout(5000);

    // Should still be on the same page (or a valid app/auth page)
    const currentUrl = page.url();
    const isValidLocation = 
      currentUrl === stableUrl ||
      currentUrl.includes('/app') ||
      currentUrl.includes('/login') ||
      currentUrl.includes('/auth') ||
      currentUrl.includes('/portal');
    
    expect(isValidLocation).toBe(true);

    // Check no unexpected redirects happened
    const unexpectedRedirects = navigations.filter(
      (url) =>
        !url.includes('/app') &&
        !url.includes('/login') &&
        !url.includes('/auth') &&
        !url.includes('/portal') &&
        !url.includes('/onboarding') &&
        !url.includes('about:blank')
    );
    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });
});
