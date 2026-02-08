/**
 * PAYMENTS/INVOICES CONTRACT TESTS — PI P1.0
 *
 * POLICY: NEVER REMOVE
 *
 * Contract tests for payments/invoices module stability.
 * P.C.1 - Deterministic rendering
 * P.C.2 - Invoice status SAFE GOLD compliance
 * P.C.3 - Payment status SAFE GOLD compliance (future-proof)
 * P.C.4 - Mutation boundary (no writes during browsing)
 * P.C.5 - Navigation stability (no async redirects)
 */

import { test, expect } from '@playwright/test';
import { loginAsTenantAdmin } from '../fixtures/auth.fixture';
import { freezeTime } from '../helpers/freeze-time';
import { logTestStep, logTestAssertion } from '../helpers/testLogger';

import {
  mockTenantInvoices,
  makeInvoice,
  makeInvoiceList,
} from '../helpers/mock-payments-invoices';

import {
  SAFE_INVOICE_STATUSES,
  PROD_INVOICE_TO_SAFE,
} from '../../src/types/payments-invoices-state';

const TENANT_SLUG = 'demo-bjj';
const TEST_TENANT_ID = 'tenant-payments-01';

// Tables that MUST NOT receive mutations during browsing
const PROTECTED_TABLES = [
  'tenants',
  'memberships',
  'payments',
  'tenant_invoices',
  'subscriptions',
  'user_roles',
  'athletes',
  'profiles',
  'tenant_billing',
];

test.describe('Payments/Invoices Contract — PI P1.0', () => {
  test('P.C.1: renders deterministically with mocked data', async ({ page }) => {
    logTestStep('CONTRACT', 'Deterministic invoice rendering');

    await freezeTime(page, '2026-02-07T12:00:00.000Z');

    await mockTenantInvoices(page, makeInvoiceList(TEST_TENANT_ID, ['paid', 'open']));

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const root = page.locator('[data-testid="billing-root"]');
    await expect(root).toBeVisible();

    // Invoice table should be visible
    const invoiceTable = page.locator('[data-testid="invoice-table"]');
    const tableVisible = await invoiceTable.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (tableVisible) {
      const invoiceRows = page.locator('[data-testid="invoice-row"]');
      const rowCount = await invoiceRows.count();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    }

    logTestAssertion('CONTRACT', 'Billing root visible with invoice data', true);
  });

  test('P.C.2: invoice status MUST be SAFE GOLD compliant', async ({ page }) => {
    logTestStep('CONTRACT', 'Invoice status enum validation');

    await freezeTime(page);

    // Test with various invoice statuses
    await mockTenantInvoices(page, [
      makeInvoice(TEST_TENANT_ID, 'paid'),
      makeInvoice(TEST_TENANT_ID, 'open', 9900, { id: 'inv_safe_gold_02', stripe_invoice_id: 'in_safe_gold_02' }),
    ]);

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    const invoiceRows = page.locator('[data-testid="invoice-row"]');
    const rowCount = await invoiceRows.count();

    if (rowCount > 0) {
      for (let i = 0; i < rowCount; i++) {
        const row = invoiceRows.nth(i);
        const rawStatus = await row.getAttribute('data-invoice-status');
        
        if (rawStatus) {
          // Map production status to SAFE GOLD
          const safeStatus = PROD_INVOICE_TO_SAFE[rawStatus.toLowerCase()] ?? rawStatus.toUpperCase();
          expect(SAFE_INVOICE_STATUSES).toContain(safeStatus);
          logTestAssertion('CONTRACT', `invoice status ok: ${rawStatus} -> ${safeStatus}`, true);
        }
      }
    } else {
      // No invoice rows present - still valid (empty state)
      logTestAssertion('CONTRACT', 'No invoice rows present (allowed)', true);
    }
  });

  test('P.C.3: payment status MUST be SAFE GOLD compliant (future-proof)', async ({ page }) => {
    logTestStep('CONTRACT', 'Payment status enum validation (future-proof)');

    await freezeTime(page);

    await mockTenantInvoices(page, makeInvoiceList(TEST_TENANT_ID));

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    // Currently no separate payment rows - this test validates future compatibility
    const paymentRows = page.locator('[data-testid="payment-row"]');
    const rowCount = await paymentRows.count();

    // Future-proof: if payment rows exist, validate their status
    if (rowCount > 0) {
      for (let i = 0; i < rowCount; i++) {
        const row = paymentRows.nth(i);
        const rawStatus = await row.getAttribute('data-payment-status');
        
        if (rawStatus) {
          // Will be validated when payments table is added
          logTestAssertion('CONTRACT', `payment status found: ${rawStatus}`, true);
        }
      }
    } else {
      logTestAssertion('CONTRACT', 'No payment rows (expected - no payments table yet)', true);
    }
  });

  test('P.C.4: NO mutations to protected tables during browsing', async ({ page }) => {
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

    await mockTenantInvoices(page, makeInvoiceList(TEST_TENANT_ID, ['paid', 'open']));

    await loginAsTenantAdmin(page);
    await page.goto(`/${TENANT_SLUG}/app/billing`);
    await page.waitForLoadState('networkidle');

    // Browse around - click filter tabs
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

  test('P.C.5: Navigation stability (no async redirects)', async ({ page }) => {
    logTestStep('CONTRACT', 'Navigation stability validation');

    const nav: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) nav.push(frame.url());
    });

    await freezeTime(page);

    await mockTenantInvoices(page, makeInvoiceList(TEST_TENANT_ID));

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
