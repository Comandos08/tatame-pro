/**
 * PI Y1.0 — YOUTH MEMBERSHIP SAFE GOLD v1.0 — Resilience Tests
 *
 * POLICY: NEVER REMOVE
 * These tests validate graceful degradation when youth membership endpoints fail.
 *
 * CONTRACTS:
 * - Y.R.1: 403 error — UI stays visible
 * - Y.R.2: 500 error — UI stays visible
 * - Y.R.3: Timeout — UI stays visible
 * - Y.R.4: Invalid JSON — UI stays visible
 * - Y.R.5: Mixed failures — UI stays visible
 * - Y.R.6: No unexpected redirects during failures
 *
 * SAFE GOLD: Failures must NEVER cause white-screen or forced redirects.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';
import { mockYouthMembershipFailure } from '../helpers/mock-youth-membership';

const TENANT_SLUG = process.env.E2E_TENANT_SLUG || 'test-tenant';

test.describe('Y1.0 — Youth Membership SAFE GOLD (Resilience)', () => {
  test('Y.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipFailure(page, '403');

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('Y.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipFailure(page, '500');

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('Y.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'timeout handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipFailure(page, 'timeout');

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('Y.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'invalid JSON handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipFailure(page, 'invalid-json');

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('Y.R.5: mixed failures — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'mixed failures handling');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    // First request fails with 403, subsequent with 500
    let requestCount = 0;
    await page.route('**/*', async (route, request) => {
      const url = request.url();
      const method = request.method();

      if (method !== 'GET') return route.continue();

      const isMembershipEndpoint =
        url.includes('/rest/v1/memberships') ||
        url.includes('/rest/v1/guardians') ||
        url.includes('/rest/v1/athletes');

      if (!isMembershipEndpoint) return route.continue();

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

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after mixed failures', true);
  });

  test('Y.R.6: no unexpected redirects during failures', async ({ page }) => {
    logTestStep('RESILIENCE', 'no redirect during failure');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, '2026-02-07T12:00:00.000Z');
    await mockYouthMembershipFailure(page, '500');

    await page.goto(`/${TENANT_SLUG}/membership/youth`);
    await page.waitForLoadState('networkidle');

    await page.waitForTimeout(5000);

    // Should not redirect to unexpected locations
    const unexpected = nav.filter(
      (u) =>
        !u.includes('/membership') &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    // Should still be on membership or valid route
    const finalUrl = page.url();
    const isValidRoute =
      finalUrl.includes('/membership') ||
      finalUrl.includes('/login');
    expect(isValidRoute).toBe(true);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });
});
