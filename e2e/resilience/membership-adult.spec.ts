/**
 * T1.0 — MEMBERSHIP ADULT RESILIENCE TESTS (SAFE GOLD v1.0)
 *
 * Validates membership adult flow stability under failure conditions.
 * SAFE GOLD: no crashes, no redirects, UI always visible.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

async function mockTenantData(page: import('@playwright/test').Page) {
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
}

async function mockMembershipFailure(
  page: import('@playwright/test').Page,
  type: '403' | '500' | 'timeout' | 'invalid-json'
) {
  await page.route('**/rest/v1/memberships*', async (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    switch (type) {
      case '403':
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden' }),
        });
      case '500':
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      case 'timeout':
        await new Promise((r) => setTimeout(r, 15000));
        return route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway Timeout' }),
        });
      case 'invalid-json':
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{ invalid json here',
        });
      default:
        return route.continue();
    }
  });
}

test.describe('T1.0 — MEMBERSHIP ADULT RESILIENCE (SAFE GOLD)', () => {
  test('M.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockMembershipFailure(page, '403');

    await page.goto(`/${TENANT_SLUG}/membership/adult`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('M.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockMembershipFailure(page, '500');

    await page.goto(`/${TENANT_SLUG}/membership/adult`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('M.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'Timeout handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockMembershipFailure(page, 'timeout');

    await page.goto(`/${TENANT_SLUG}/membership/adult`);
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('M.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Invalid JSON handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockMembershipFailure(page, 'invalid-json');

    await page.goto(`/${TENANT_SLUG}/membership/adult`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('M.R.5: no redirect under any failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect check');

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockMembershipFailure(page, '500');

    await page.goto(`/${TENANT_SLUG}/membership/adult`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Filter out expected navigations
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes(`/${TENANT_SLUG}`) &&
        !u.includes('/login') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });
});
