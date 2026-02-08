/**
 * 🛡️ Events Resilience Tests — PI E1.0
 *
 * POLICY: NEVER WEAKEN
 *
 * These tests validate graceful degradation under failure conditions:
 * - 403 Forbidden
 * - 500 Internal Server Error
 * - Network timeout
 * - Invalid JSON response
 * - Mixed failures
 */

import { test, expect } from '@playwright/test';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

const TEST_TENANT_SLUG = 'demo-bjj';

test.describe('Events Resilience — PI E1.0', () => {
  test('E.R.1: 403 Forbidden does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing 403 Forbidden handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Mock events endpoint to return 403
    await page.route('**/rest/v1/events*', route => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden', message: 'Access denied' }),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
    await page.waitForLoadState('networkidle');

    // UI should still render (body visible)
    await expect(page.locator('body')).toBeVisible();

    // Should NOT show error boundary crash screen
    const errorBoundary = page.locator('text=/algo deu errado|something went wrong/i');
    const hasErrorBoundary = await errorBoundary.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasErrorBoundary).toBe(false);

    // Page should be interactive (not frozen)
    const anyButton = page.locator('button').first();
    if (await anyButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(anyButton).toBeEnabled();
    }

    logTestAssertion('RESILIENCE', '403 handled gracefully', true);
  });

  test('E.R.2: 500 Internal Server Error does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing 500 Server Error handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Mock events endpoint to return 500
    await page.route('**/rest/v1/events*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
    await page.waitForLoadState('networkidle');

    // UI should render
    await expect(page.locator('body')).toBeVisible();

    // Should show empty state or error message (but not crash)
    const content = await page.textContent('body');
    expect(content?.length).toBeGreaterThan(50);

    logTestAssertion('RESILIENCE', '500 handled gracefully', true);
  });

  test('E.R.3: Network timeout does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing network timeout handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Mock events endpoint with long delay (15s)
    await page.route('**/rest/v1/events*', async route => {
      await new Promise(resolve => setTimeout(resolve, 15000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAsTenantAdmin(page);

    // Navigate with extended timeout
    await page.goto(`/${TEST_TENANT_SLUG}/app/events`, { timeout: 30000 });

    // Wait for page to handle timeout
    await page.waitForTimeout(5000);

    // UI should still be visible (not crashed)
    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'Timeout handled gracefully', true);
  });

  test('E.R.4: Invalid JSON response does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing invalid JSON handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Mock events endpoint with invalid JSON
    await page.route('**/rest/v1/events*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json {{{',
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
    await page.waitForLoadState('networkidle');

    // UI should still render
    await expect(page.locator('body')).toBeVisible();

    // No white screen - page has content
    const content = await page.textContent('body');
    expect(content?.trim().length).toBeGreaterThan(10);

    logTestAssertion('RESILIENCE', 'Invalid JSON handled gracefully', true);
  });

  test('E.R.5: Mixed failures do not cause cascade', async ({ page }) => {
    logTestStep('RESILIENCE', 'Testing mixed failure cascade prevention');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Fail events endpoint
    await page.route('**/rest/v1/events*', route => {
      route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'Service Unavailable',
      });
    });

    // Allow categories endpoint
    await page.route('**/rest/v1/event_categories*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TEST_TENANT_SLUG}/app/events`);
    await page.waitForLoadState('networkidle');

    // Page should not completely crash
    await expect(page.locator('body')).toBeVisible();

    // Content should exist
    const content = await page.textContent('body');
    expect(content?.trim().length).toBeGreaterThan(10);

    logTestAssertion('RESILIENCE', 'Mixed failures handled without cascade', true);
  });
});
