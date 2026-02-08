/**
 * BILLING SAFE GOLD — E2E Mock Helpers v1.0
 *
 * Deterministic mocks for billing-related endpoints.
 * SAFE GOLD: read-only, no mutations.
 */

import { Page } from '@playwright/test';

export interface MockBillingData {
  id: string;
  tenant_id: string;
  status: string;
  plan_name: string;
  is_manual_override: boolean;
  override_reason: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  scheduled_delete_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface MockInvoiceData {
  id: string;
  tenant_id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
}

/**
 * Mock tenant_billing endpoint
 */
export async function mockTenantBilling(
  page: Page,
  billing: MockBillingData | null
): Promise<void> {
  await page.route('**/rest/v1/tenant_billing*', (route, request) => {
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') {
      route.continue();
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(billing ? [billing] : []),
    });
  });
}

/**
 * Mock tenant_invoices endpoint
 */
export async function mockTenantInvoices(
  page: Page,
  invoices: MockInvoiceData[]
): Promise<void> {
  await page.route('**/rest/v1/tenant_invoices*', (route, request) => {
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') {
      route.continue();
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(invoices),
    });
  });
}

/**
 * Mock billing base (billing + invoices)
 */
export async function mockBillingBase(
  page: Page,
  mocks: {
    billing?: MockBillingData | null;
    invoices?: MockInvoiceData[];
  }
): Promise<void> {
  const { billing = null, invoices = [] } = mocks;

  await page.route('**/rest/v1/**', (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: billing contract tests are READ-ONLY
    if (method !== 'GET') {
      route.continue();
      return;
    }

    if (url.includes('/rest/v1/tenant_billing')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(billing ? [billing] : []),
      });
      return;
    }

    if (url.includes('/rest/v1/tenant_invoices')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(invoices),
      });
      return;
    }

    route.continue();
  });
}

/** Factory: create billing data */
export function makeBillingData(
  tenantId: string,
  status: string,
  options: Partial<MockBillingData> = {}
): MockBillingData {
  return {
    id: `billing-${Date.now()}`,
    tenant_id: tenantId,
    status,
    plan_name: 'Growth',
    is_manual_override: false,
    override_reason: null,
    trial_ends_at: null,
    current_period_end: null,
    scheduled_delete_at: null,
    stripe_customer_id: `cus_test_${Date.now()}`,
    stripe_subscription_id: `sub_test_${Date.now()}`,
    ...options,
  };
}

/** Factory: create invoice data */
export function makeInvoiceData(
  tenantId: string,
  status: string,
  amountCents: number,
  options: Partial<MockInvoiceData> = {}
): MockInvoiceData {
  return {
    id: `inv-${Date.now()}`,
    tenant_id: tenantId,
    stripe_invoice_id: `in_test_${Date.now()}`,
    amount_cents: amountCents,
    currency: 'BRL',
    status,
    due_date: null,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
    hosted_invoice_url: 'https://invoice.stripe.com/test',
    created_at: new Date().toISOString(),
    ...options,
  };
}
