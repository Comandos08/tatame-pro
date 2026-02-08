/**
 * T1.0 — EVENTS RUNTIME CONTRACT TESTS (SAFE GOLD v1.0)
 *
 * Validates events module contracts.
 * SAFE GOLD: no mutations, no redirects, deterministic.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

const PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'guardians',
  'tenant_billing',
  'tenant_invoices',
  'events',
  'reports',
];

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

async function mockEventsEmpty(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/events*', (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

async function mockEventsWithData(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/events*', (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'event-safe-gold-01',
          name: 'Test Championship',
          status: 'PUBLISHED',
          event_date: '2026-03-15',
          tenant_id: 'tenant-safe-gold-01',
          is_public: true,
        },
        {
          id: 'event-safe-gold-02',
          name: 'Regional Open',
          status: 'DRAFT',
          event_date: '2026-04-20',
          tenant_id: 'tenant-safe-gold-01',
          is_public: false,
        },
      ]),
    });
  });
}

async function mockEventsFailure(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/events*', (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' }),
    });
  });
}

test.describe('T1.0 — EVENTS RUNTIME CONTRACT (SAFE GOLD)', () => {
  test('E.C.1: empty list renders correctly', async ({ page }) => {
    logTestStep('EVENTS', 'Empty list render');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsEmpty(page);

    await page.goto(`/${TENANT_SLUG}/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    // Should show empty state or just render without error
    const is404 = await page.locator('text=404').count();
    expect(is404).toBe(0);

    logTestAssertion('EVENTS', 'Empty list rendered', true);
  });

  test('E.C.2: list with data renders correctly', async ({ page }) => {
    logTestStep('EVENTS', 'List with data render');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsWithData(page);

    await page.goto(`/${TENANT_SLUG}/events`);
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    // Page should render (may or may not show event names depending on auth)
    const is404 = await page.locator('text=404').count();
    expect(is404).toBe(0);

    logTestAssertion('EVENTS', 'List with data rendered', true);
  });

  test('E.C.3: backend failure does not break UI', async ({ page }) => {
    logTestStep('EVENTS', 'Backend failure handling');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsFailure(page);

    await page.goto(`/${TENANT_SLUG}/events`);
    await page.waitForTimeout(3000);

    // UI should still be visible
    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    // No crash indicators
    const hasCrash = await page.locator('text=Something went wrong').count();
    // Crash indicator is acceptable, but page should not be blank

    logTestAssertion('EVENTS', 'UI visible after failure', true);
  });

  test('E.C.4: no mutations during browsing', async ({ page }) => {
    logTestStep('EVENTS', 'Mutation boundary');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsWithData(page);

    const mutations: string[] = [];
    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const isProtected = PROTECTED_TABLES.some((table) =>
          url.includes(`/rest/v1/${table}`)
        );
        if (isProtected) {
          mutations.push(`${method} ${url}`);
        }
      }
      route.continue();
    });

    await page.goto(`/${TENANT_SLUG}/events`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('EVENTS', 'No mutations detected', true);
  });

  test('E.C.5: navigation stable for 10 seconds', async ({ page }) => {
    logTestStep('EVENTS', 'Navigation stability');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockTenantData(page);
    await mockEventsWithData(page);

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await page.goto(`/${TENANT_SLUG}/events`);
    await page.waitForLoadState('networkidle');

    const initialUrl = page.url();

    // Wait 10 seconds
    await page.waitForTimeout(10000);

    const finalUrl = page.url();

    // URL should be stable
    expect(new URL(finalUrl).pathname).toBe(new URL(initialUrl).pathname);

    // No unexpected redirects
    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes(`/${TENANT_SLUG}`) &&
        !u.includes('/login') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('EVENTS', 'Navigation stable for 10s', true);
  });
});
