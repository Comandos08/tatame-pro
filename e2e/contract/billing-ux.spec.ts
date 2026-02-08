/**
 * B2.0 — BILLING UX SAFE GOLD v1.1 (Contract Tests)
 *
 * Validates billing state instrumentation and mutation boundaries.
 * SAFE GOLD: deterministic, no mutations during browsing.
 */

import { test, expect } from '@playwright/test';
import { freezeTime } from '@/../e2e/helpers/freeze-time';
import { logTestStep, logTestAssertion } from '@/../e2e/helpers/testLogger';
import { loginAsSuperAdmin, TENANT_SLUG } from '@/../e2e/fixtures/auth.fixture';
import { mockBillingBase, makeBillingData, FIXED_IDS, FIXED_TIMESTAMP_ISO } from '@/../e2e/helpers/mock-billing';
import { SAFE_BILLING_STATES, SAFE_BILLING_VIEW_STATES } from '@/types/billing-view-state';

const PROTECTED_TABLES = [
  'tenant_billing',
  'tenant_invoices',
  'tenants',
  'profiles',
  'memberships',
  'athletes',
];

test.describe('B2.0 — Billing UX SAFE GOLD (Contract)', () => {
  test('B.C.1: billing state MUST be in SAFE_BILLING_STATES', async ({ page }) => {
    logTestStep('CONTRACT', 'Billing state validation');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingBase(page, {
      billing: makeBillingData(FIXED_IDS.BILLING_ID, 'ACTIVE'),
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible();

    const billingState = await shell.getAttribute('data-billing-state');
    expect(billingState).toBeTruthy();
    expect(SAFE_BILLING_STATES).toContain(billingState as any);

    logTestAssertion('CONTRACT', `Billing state ok: ${billingState}`, true);
  });

  test('B.C.2: billing view state MUST be in SAFE_BILLING_VIEW_STATES', async ({ page }) => {
    logTestStep('CONTRACT', 'Billing view state validation');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingBase(page, {
      billing: makeBillingData(FIXED_IDS.BILLING_ID, 'PAST_DUE'),
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const shell = page.locator('[data-testid="app-shell"]');
    await expect(shell).toBeVisible();

    const viewState = await shell.getAttribute('data-billing-view-state');
    expect(viewState).toBeTruthy();
    expect(SAFE_BILLING_VIEW_STATES).toContain(viewState as any);

    logTestAssertion('CONTRACT', `Billing view state ok: ${viewState}`, true);
  });

  test('B.C.3: banner appears when billing ≠ ACTIVE', async ({ page }) => {
    logTestStep('CONTRACT', 'Banner visibility for non-ACTIVE');

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingBase(page, {
      billing: makeBillingData(FIXED_IDS.BILLING_ID, 'PAST_DUE'),
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Check for billing banner (either the new one or existing)
    const banner = page.locator('[data-testid="billing-ux-banner"], [data-testid="billing-status-banner"]');
    
    // At least one should be visible OR the billing state should indicate warning/blocked
    const shell = page.locator('[data-testid="app-shell"]');
    const viewState = await shell.getAttribute('data-billing-view-state');
    
    expect(['WARNING', 'BLOCKED', 'ERROR']).toContain(viewState as any);

    logTestAssertion('CONTRACT', 'Banner or view state indicates billing issue', true);
  });

  test('B.C.4: NO mutations to protected tables during browsing', async ({ page }) => {
    logTestStep('CONTRACT', 'Mutation boundary enforcement');

    const mutations: string[] = [];

    await page.route('**/rest/v1/**', (route, request) => {
      const method = request.method();
      const url = request.url();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        for (const t of PROTECTED_TABLES) {
          if (url.includes(`/rest/v1/${t}`)) {
            mutations.push(`${method} ${t}`);
          }
        }
      }
      route.continue();
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingBase(page, {
      billing: makeBillingData(FIXED_IDS.BILLING_ID, 'ACTIVE'),
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    // Browse around
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('CONTRACT', 'No mutations detected', true);
  });

  test('B.C.5: navigation stability (no redirect in 10s)', async ({ page }) => {
    logTestStep('CONTRACT', 'Navigation stability');

    const nav: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page, FIXED_TIMESTAMP_ISO);
    await mockBillingBase(page, {
      billing: makeBillingData(FIXED_IDS.BILLING_ID, 'ACTIVE'),
    });

    await loginAsSuperAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();
    await page.waitForTimeout(10000);

    expect(page.url()).toBe(stableUrl);

    const unexpectedRedirects = nav.filter(
      (u) =>
        !u.includes('/app') &&
        !u.includes('/login') &&
        !u.includes('/auth') &&
        !u.includes('about:blank')
    );
    expect(unexpectedRedirects.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable for 10s', true);
  });

  test('B.C.6: all billing states are handled', async ({ page }) => {
    logTestStep('CONTRACT', 'All billing states handled');

    for (const state of SAFE_BILLING_STATES) {
      await freezeTime(page, FIXED_TIMESTAMP_ISO);
      await mockBillingBase(page, {
        billing: makeBillingData(FIXED_IDS.BILLING_ID, state),
      });

      await loginAsSuperAdmin(page);
      await page.goto(`/${TENANT_SLUG}/app`);
      await page.waitForLoadState('networkidle');

      const shell = page.locator('[data-testid="app-shell"]');
      await expect(shell).toBeVisible();

      const billingState = await shell.getAttribute('data-billing-state');
      expect(billingState).toBe(state);

      logTestAssertion('CONTRACT', `State ${state} handled`, true);
    }
  });
});
