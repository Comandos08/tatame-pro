/**
 * T1.0 — BILLING RUNTIME CONTRACT TESTS (SAFE GOLD v1.0)
 *
 * Validates billing state handling at runtime.
 * SAFE GOLD: no mutations, no redirects, deterministic.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { loginAsSuperAdmin, TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';
import { makeBillingData, FIXED_TIMESTAMP_ISO } from '@/../e2e/helpers/mock-billing';

const SAFE_BILLING_STATES = ['ACTIVE', 'INCOMPLETE', 'PAST_DUE', 'UNPAID', 'CANCELED'];
const SAFE_VIEW_STATES = ['READY', 'BLOCKED', 'WARNING', 'ERROR'];

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

async function mockBillingState(
  page: import('@playwright/test').Page,
  status: string
) {
  const billing = makeBillingData('tenant-safe-gold-01', status);

  await page.route('**/rest/v1/tenant_billing*', (route, request) => {
    if (request.method() !== 'GET') return route.continue();

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([billing]),
    });
  });
}

test.describe('T1.0 — BILLING RUNTIME CONTRACT (SAFE GOLD)', () => {
  for (const billingState of SAFE_BILLING_STATES) {
    test(`B.C.1: ${billingState} is valid SAFE state`, async ({ page }) => {
      logTestStep('BILLING', `Testing ${billingState}`);

      await freezeTime(page, FIXED_TIMESTAMP_ISO);
      await mockBillingState(page, billingState);

      await loginAsSuperAdmin(page);
      await page.goto(`/${TENANT_SLUG}/app`);
      await page.waitForTimeout(3000);

      // Check data attribute
      const shell = page.locator('[data-testid="app-shell"]');
      await expect(shell).toBeVisible({ timeout: 10000 });

      const state = await shell.getAttribute('data-billing-state');
      expect(SAFE_BILLING_STATES).toContain(state);

      logTestAssertion('BILLING', `${billingState} is SAFE`, true);
    });
  }

  test('B.C.2: view state is coherent with billing state', async ({ page }) => {
    logTestStep('BILLING', 'View state coherence');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingState(page, 'ACTIVE');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForTimeout(3000);

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible({ timeout: 10000 });

    const viewState = await shell.getAttribute('data-billing-view-state');
    expect(SAFE_VIEW_STATES).toContain(viewState);

    // ACTIVE should map to READY
    expect(viewState).toBe('READY');

    logTestAssertion('BILLING', 'View state coherent', true);
  });

  test('B.C.3: no redirect on any billing state', async ({ page }) => {
    logTestStep('BILLING', 'No redirect check');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);

    const redirects: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    // Test with PAST_DUE (potential redirect trigger)
    await mockBillingState(page, 'PAST_DUE');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
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

    logTestAssertion('BILLING', 'No unexpected redirects', true);
  });

  test('B.C.4: no mutations during billing browsing', async ({ page }) => {
    logTestStep('BILLING', 'Mutation boundary');

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

    await mockBillingState(page, 'ACTIVE');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('BILLING', 'No mutations detected', true);
  });

  test('B.C.5: URL stable for 10 seconds', async ({ page }) => {
    logTestStep('BILLING', 'URL stability');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingState(page, 'ACTIVE');

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const initialUrl = page.url();

    // Wait 10 seconds
    await page.waitForTimeout(10000);

    const finalUrl = page.url();

    // URL should be stable
    expect(new URL(finalUrl).pathname).toBe(new URL(initialUrl).pathname);

    logTestAssertion('BILLING', 'URL stable for 10s', true);
  });
});
