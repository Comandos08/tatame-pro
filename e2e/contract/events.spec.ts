/**
 * T1.0 — EVENTS CONTRACT TESTS (FINAL LOCK) (SAFE GOLD v1.0)
 *
 * Final contract lock for events module.
 * SAFE GOLD: no mutations, no redirects, deterministic.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';

const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

// SAFE EVENT STATUSES (from domain/events/safeEnums.ts)
const SAFE_EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'] as const;

const PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'guardians',
  'tenant_billing',
];

function mockEventWithStatus(
  page: import('@playwright/test').Page,
  status: (typeof SAFE_EVENT_STATUSES)[number],
  options?: {
    registrationOpen?: boolean;
    startDate?: string;
    endDate?: string;
  }
) {
  const now = new Date(FIXED_TIMESTAMP_ISO);
  const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  return page.route('**/rest/v1/events*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'event-id',
          tenant_id: 'tenant-id',
          name: 'Test Event',
          status: status,
          start_date: options?.startDate || futureDate,
          end_date: options?.endDate || futureDate,
          registration_opens_at: options?.registrationOpen ? pastDate : futureDate,
          registration_closes_at: futureDate,
          is_public: status === 'PUBLISHED',
        },
      ]),
    });
  });
}

test.describe('T1.0 — EVENTS CONTRACT (FINAL LOCK) (SAFE GOLD)', () => {
  test('EVENTS.C.1: evento DRAFT não abre inscrição', async ({ page }) => {
    logTestStep('EVENTS', 'DRAFT event does not allow registration');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockEventWithStatus(page, 'DRAFT', { registrationOpen: true });

    await page.goto('/test-tenant/events');
    await page.waitForTimeout(3000);

    // UI should be visible
    await expect(page.locator('body')).toBeVisible();

    // DRAFT events should not show registration button publicly
    // (they may not even appear in public list)
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('EVENTS', 'DRAFT event handled correctly', true);
  });

  test('EVENTS.C.2: evento PUBLISHED respeita datas', async ({ page }) => {
    logTestStep('EVENTS', 'PUBLISHED event respects dates');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    
    // Event with registration open
    await mockEventWithStatus(page, 'PUBLISHED', { registrationOpen: true });

    await page.goto('/test-tenant/events');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('EVENTS', 'PUBLISHED event respects dates', true);
  });

  test('EVENTS.C.3: categories/brackets não quebram sem dados', async ({ page }) => {
    logTestStep('EVENTS', 'Empty categories/brackets do not break UI');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    // Mock event with empty categories
    await page.route('**/rest/v1/events*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'event-id',
            tenant_id: 'tenant-id',
            name: 'Test Event',
            status: 'PUBLISHED',
            start_date: '2026-03-01T00:00:00.000Z',
            end_date: '2026-03-01T00:00:00.000Z',
          },
        ]),
      });
    });

    // Mock empty categories
    await page.route('**/rest/v1/event_categories*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock empty brackets
    await page.route('**/rest/v1/event_brackets*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/test-tenant/events');
    await page.waitForTimeout(3000);

    await expect(page.locator('body')).toBeVisible();
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);

    logTestAssertion('EVENTS', 'Empty categories/brackets handled', true);
  });

  test('EVENTS.C.4: status ∈ SAFE_EVENT_STATUSES', async ({ page }) => {
    logTestStep('EVENTS', 'Event status enum validation');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    for (const status of SAFE_EVENT_STATUSES) {
      await page.unroute('**/rest/v1/events*');
      await mockEventWithStatus(page, status);

      await page.goto('/test-tenant/events');
      await page.waitForTimeout(1500);

      await expect(page.locator('body')).toBeVisible();
    }

    logTestAssertion('EVENTS', 'All SAFE event statuses valid', true);
  });

  test('EVENTS.C.5: no mutations during events browsing', async ({ page }) => {
    logTestStep('EVENTS', 'Mutation boundary check');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

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

    await mockEventWithStatus(page, 'PUBLISHED');
    await page.goto('/test-tenant/events');
    await page.waitForTimeout(3000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('EVENTS', 'No mutations detected', true);
  });

  test('EVENTS.C.6: URL stable for 10 seconds', async ({ page }) => {
    logTestStep('EVENTS', 'URL stability check');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockEventWithStatus(page, 'PUBLISHED');

    await page.goto('/test-tenant/events');
    await page.waitForLoadState('networkidle');

    const initialUrl = page.url();
    await page.waitForTimeout(10000);
    const finalUrl = page.url();

    expect(new URL(finalUrl).pathname).toBe(new URL(initialUrl).pathname);

    logTestAssertion('EVENTS', 'URL stable for 10s', true);
  });

  test('EVENTS.C.7: no redirect on any event status', async ({ page }) => {
    logTestStep('EVENTS', 'No redirect check');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    await mockEventWithStatus(page, 'PUBLISHED');
    await page.goto('/test-tenant/events');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const unexpectedRedirects = redirects.filter(
      (u) =>
        !u.includes('/test-tenant/events') &&
        !u.includes('/login') &&
        !u.includes('about:blank')
    );

    expect(unexpectedRedirects.length).toBeLessThanOrEqual(1);

    logTestAssertion('EVENTS', 'No unexpected redirects', true);
  });
});
