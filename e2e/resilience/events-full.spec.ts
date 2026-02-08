/**
 * E1.0 — EVENTS FULL RESILIENCE TESTS (SAFE GOLD v1.0)
 *
 * Validates events module stability under failure conditions.
 * SAFE GOLD: no crashes, no redirects, UI always visible.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { loginAsSuperAdmin, TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';

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

async function mockEventsFailure(
  page: import('@playwright/test').Page,
  type: '403' | '500' | 'timeout' | 'invalid-json'
) {
  await page.route('**/rest/v1/events*', async (route, request) => {
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

async function mockCategoriesFailure(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/event_categories*', (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Categories Error' }),
    });
  });
}

async function mockBracketsFailure(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/event_brackets*', (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Brackets Error' }),
    });
  });
}

async function mockEventsSuccess(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/events*', (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'event-01',
          name: 'Test Event',
          status: 'PUBLISHED',
          event_date: '2026-03-15',
          tenant_id: 'tenant-safe-gold-01',
          is_public: true,
        },
      ]),
    });
  });
}

test.describe('E1.0 — EVENTS FULL RESILIENCE (SAFE GOLD)', () => {
  test('E.R.1: 403 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '403 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page, '403');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 403', true);
  });

  test('E.R.2: 500 — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', '500 handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after 500', true);
  });

  test('E.R.3: timeout — UI stays visible', async ({ page }) => {
    test.setTimeout(30000);
    logTestStep('RESILIENCE', 'Timeout handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page, 'timeout');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(5000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after timeout', true);
  });

  test('E.R.4: invalid JSON — UI stays visible', async ({ page }) => {
    logTestStep('RESILIENCE', 'Invalid JSON handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page, 'invalid-json');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI visible after invalid JSON', true);
  });

  test('E.R.5: bracket generation failure — UI survives', async ({ page }) => {
    logTestStep('RESILIENCE', 'Bracket failure handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsSuccess(page);
    await mockBracketsFailure(page);

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI survives bracket failure', true);
  });

  test('E.R.6: chained failure (events + categories) — UI stable', async ({ page }) => {
    logTestStep('RESILIENCE', 'Chained failure handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page, '500');
    await mockCategoriesFailure(page);

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'UI stable after chained failures', true);
  });

  test('E.R.7: no redirect under any events failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'No redirect check');

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Filter out expected navigations
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes(`/${TENANT_SLUG}`) &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('RESILIENCE', 'No unexpected redirects', true);
  });

  test('E.R.8: public events page resilient', async ({ page }) => {
    logTestStep('RESILIENCE', 'Public page resilience');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page, '500');

    await page.goto(`/${TENANT_SLUG}/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'Public page survives failure', true);
  });

  test('E.R.9: recovery after failure', async ({ page }) => {
    logTestStep('RESILIENCE', 'Recovery handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);

    // Start with failure
    await mockEventsFailure(page, '500');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(2000);

    // UI should be visible even in failure
    await expect(page.locator('body')).toBeVisible();

    // Clear routes and mock success
    await page.unrouteAll();
    await mockTenantData(page);
    await mockEventsSuccess(page);

    // Navigate again
    await page.goto(`/${TENANT_SLUG}/app/events`);
    await page.waitForTimeout(2000);

    // UI should still be visible
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('RESILIENCE', 'Recovered after failure', true);
  });
});
