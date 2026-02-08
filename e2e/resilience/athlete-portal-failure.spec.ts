/**
 * 🛡️ Athlete Portal Resilience Tests — PI A1.0
 *
 * POLICY: NEVER REMOVE
 *
 * These tests validate the Portal's resilience to backend failures.
 * The UI must remain functional and not crash under adverse conditions.
 */

import { test, expect } from '@playwright/test';
import { loginAsApprovedAthlete } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

const TEST_TENANT_SLUG = 'demo-bjj';

test.describe('Athlete Portal Resilience — PI A1.0', () => {
  test('A.R.1: 403 Forbidden does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    await page.route('**/rest/v1/profiles*', route =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      })
    );

    await page.route('**/rest/v1/athletes*', route =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forbidden' }),
      })
    );

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // Should not show hard crash message
    const crashIndicator = page.locator('text=/algo deu errado|something went wrong/i');
    const hasCrash = await crashIndicator.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasCrash).toBe(false);

    logTestAssertion('RESILIENCE', '403 handled gracefully', true);
  });

  test('A.R.2: 500 Server Error does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    await page.route('**/rest/v1/memberships*', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    );

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    const content = await page.textContent('body');
    expect((content || '').length).toBeGreaterThan(20);

    logTestAssertion('RESILIENCE', '500 handled gracefully', true);
  });

  test('A.R.3: Network timeout does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Timeout handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    await page.route('**/rest/v1/memberships*', async route => {
      // Simulate 15 second delay
      await new Promise(resolve => setTimeout(resolve, 15000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`, { timeout: 30000 });

    // Wait a bit and check UI is still functional
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'Timeout handled gracefully', true);
  });

  test('A.R.4: Invalid JSON does not crash UI', async ({ page }) => {
    logTestStep('RESILIENCE', 'Invalid JSON handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    await page.route('**/rest/v1/digital_cards*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json {{{',
      })
    );

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    logTestAssertion('RESILIENCE', 'Invalid JSON handled gracefully', true);
  });

  test('A.R.5: Mixed failures do not cascade', async ({ page }) => {
    logTestStep('RESILIENCE', 'Mixed failures handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // Profiles OK
    await page.route('**/rest/v1/profiles*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );

    // Memberships 503
    await page.route('**/rest/v1/memberships*', route =>
      route.fulfill({
        status: 503,
        contentType: 'text/plain',
        body: 'Service Unavailable',
      })
    );

    await loginAsApprovedAthlete(page);
    await page.goto(`/${TEST_TENANT_SLUG}/portal`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    const content = await page.textContent('body');
    expect((content || '').trim().length).toBeGreaterThan(10);

    logTestAssertion('RESILIENCE', 'Mixed failures handled gracefully', true);
  });
});
