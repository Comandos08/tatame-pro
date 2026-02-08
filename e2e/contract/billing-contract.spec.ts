/**
 * BILLING CONTRACT TESTS — PI B1.0
 *
 * POLICY: NEVER REMOVE
 *
 * Contract tests for billing module stability.
 * B.C.1 - Deterministic rendering
 * B.C.2 - Billing status SAFE GOLD compliance
 * B.C.3 - Billing source SAFE GOLD compliance
 * B.C.4 - Mutation boundary (no writes during browsing)
 * B.C.5 - Navigation stability (no async redirects)
 */

import { test, expect } from '@playwright/test';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

import {
  mockBillingBase,
  makeBillingData,
  makeInvoiceData,
} from '../helpers/mock-billing';

import {
  SAFE_BILLING_STATUSES,
  SAFE_BILLING_SOURCES,
  PRODUCTION_TO_SAFE_STATUS,
} from '../../src/types/billing-state';

const TENANT_SLUG = 'demo-bjj';
const TEST_TENANT_ID = 'tenant-billing-01';

// Tables that MUST NOT receive mutations during billing browsing
const PROTECTED_TABLES = [
  'tenants',
  'memberships',
  'payments',
  'invoices',
  'subscriptions',
  'user_roles',
  'athletes',
  'profiles',
  'tenant_billing',
];

test.describe('Billing Contract — PI B1.0', () => {
  test('B.C.1: renders deterministically with mocked data', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic billing rendering');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    await mockBillingBase(page, {
      billing: makeBillingData(TEST_TENANT_ID, 'ACTIVE'),
      invoices: [
        makeInvoiceData(TEST_TENANT_ID, 'paid', 9900),
        makeInvoiceData(TEST_TENANT_ID, 'open', 9900),
      ],
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const root = page.locator('[data-testid="billing-root"]');
    await expect(root).toBeVisible();

    logTestAssertion('CONTRACT', 'Billing root visible', true);
  });

  test('B.C.2: data-billing-status MUST be SAFE GOLD compliant', async ({ page }) => {
    logTestStep('CONTRACT', 'Billing status enum validation');

    await freezeTime(page);

    // Test with TRIALING (should map to TRIAL in SAFE GOLD)
    await mockBillingBase(page, {
      billing: makeBillingData(TEST_TENANT_ID, 'TRIALING'),
      invoices: [],
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const billingCard = page.locator('[data-testid="billing-card"]');
    const visible = await billingCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!visible) {
      logTestAssertion('CONTRACT', 'Billing card not present (allowed for SETUP tenants)', true);
      return;
    }

    const rawStatus = await billingCard.getAttribute('data-billing-status');
    expect(rawStatus).toBeTruthy();

    // Map production status to SAFE GOLD
    const safeStatus = PRODUCTION_TO_SAFE_STATUS[rawStatus!.toUpperCase()] ?? rawStatus;
    expect(SAFE_BILLING_STATUSES).toContain(safeStatus);

    logTestAssertion('CONTRACT', `billing status ok: ${rawStatus} -> ${safeStatus}`, true);
  });

  test('B.C.3: data-billing-source MUST be SAFE GOLD compliant', async ({ page }) => {
    logTestStep('CONTRACT', 'Billing source enum validation');

    await freezeTime(page);

    await mockBillingBase(page, {
      billing: makeBillingData(TEST_TENANT_ID, 'ACTIVE', { is_manual_override: false }),
      invoices: [],
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const billingCard = page.locator('[data-testid="billing-card"]');
    const visible = await billingCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!visible) {
      logTestAssertion('CONTRACT', 'Billing card not present (allowed for SETUP tenants)', true);
      return;
    }

    const source = await billingCard.getAttribute('data-billing-source');
    expect(source).toBeTruthy();

    // Normalize source to SAFE GOLD
    const normalizedSource = source?.toUpperCase() === 'MANUAL_OVERRIDE' ? 'MANUAL' : source?.toUpperCase();
    expect(SAFE_BILLING_SOURCES).toContain(normalizedSource);

    logTestAssertion('CONTRACT', `billing source ok: ${source}`, true);
  });

  test('B.C.4: NO mutations to protected tables during billing browsing', async ({ page }) => {
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

    await freezeTime(page);

    await mockBillingBase(page, {
      billing: makeBillingData(TEST_TENANT_ID, 'ACTIVE'),
      invoices: [makeInvoiceData(TEST_TENANT_ID, 'paid', 9900)],
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    // Browse around - click tabs, etc
    const allTab = page.locator('button:has-text("Todas")');
    if (await allTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allTab.click();
    }

    const openTab = page.locator('button:has-text("Abertas")');
    if (await openTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openTab.click();
    }

    const paidTab = page.locator('button:has-text("Pagas")');
    if (await paidTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await paidTab.click();
    }

    await page.waitForTimeout(2000);

    expect(mutations).toHaveLength(0);

    logTestAssertion('CONTRACT', 'No mutations during browsing', true);
  });

  test('B.C.5: Navigation stability (no async redirects)', async ({ page }) => {
    logTestStep('CONTRACT', 'Navigation stability validation');

    const nav: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page);

    await mockBillingBase(page, {
      billing: makeBillingData(TEST_TENANT_ID, 'ACTIVE'),
      invoices: [],
    });

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const stableUrl = page.url();
    await page.waitForTimeout(10000);

    expect(page.url()).toBe(stableUrl);

    // Check no unexpected redirects
    const unexpected = nav.filter(u => 
      !u.includes('/billing') && 
      !u.includes('/app') && 
      !u.includes('/login') &&
      !u.includes('about:blank')
    );
    expect(unexpected.length).toBe(0);

    logTestAssertion('CONTRACT', 'Navigation stable for 10s', true);
  });
});
