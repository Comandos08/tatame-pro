/**
 * PAYMENTS/INVOICES SAFE GOLD — E2E Mock Helpers v1.0
 *
 * Deterministic mocks for payments/invoices endpoints.
 * SAFE GOLD: read-only, no mutations.
 *
 * ❌ Date.now
 * ❌ new Date
 * ❌ Math.random
 * ✅ FIXED_TIMESTAMP_ISO
 * ✅ FIXED_IDS
 */

import { Page } from '@playwright/test';

/* ======================================================
   SAFE GOLD — DETERMINISTIC CONSTANTS
   ====================================================== */

export const FIXED_TIMESTAMP_ISO = '2026-02-07T12:00:00.000Z';

export const FIXED_IDS = {
  INVOICE_ID: 'inv_safe_gold_01',
  INVOICE_ID_2: 'inv_safe_gold_02',
  STRIPE_INVOICE_ID: 'in_safe_gold_01',
  STRIPE_INVOICE_ID_2: 'in_safe_gold_02',
  STRIPE_CUSTOMER_ID: 'cus_safe_gold_01',
  PAYMENT_ID: 'pay_safe_gold_01',
  PAYMENT_INTENT_ID: 'pi_safe_gold_01',
};

/* ======================================================
   INTERFACES
   ====================================================== */

export interface MockInvoiceData {
  id: string;
  tenant_id: string;
  stripe_invoice_id: string;
  stripe_customer_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockPaymentData {
  id: string;
  tenant_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  method: string;
  created_at: string;
  updated_at: string;
}

/* ======================================================
   MOCK ROUTE HANDLERS (READ-ONLY)
   ====================================================== */

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
 * Mock payments endpoint (if it exists in future)
 */
export async function mockPayments(
  page: Page,
  payments: MockPaymentData[]
): Promise<void> {
  await page.route('**/rest/v1/payments*', (route, request) => {
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') {
      route.continue();
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payments),
    });
  });
}

/**
 * Mock both invoices and payments (combined)
 */
export async function mockPaymentsInvoicesBase(
  page: Page,
  mocks: {
    invoices?: MockInvoiceData[];
    payments?: MockPaymentData[];
  }
): Promise<void> {
  const { invoices = [], payments = [] } = mocks;

  await page.route('**/rest/v1/**', (route, request) => {
    const url = request.url();
    const method = request.method();

    // SAFE GOLD: only mock GET requests
    if (method !== 'GET') {
      route.continue();
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

    if (url.includes('/rest/v1/payments')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payments),
      });
      return;
    }

    route.continue();
  });
}

/* ======================================================
   FACTORIES (100% DETERMINISTIC)
   ====================================================== */

/** Factory: create invoice data (DETERMINISTIC) */
export function makeInvoice(
  tenantId: string,
  status: string = 'paid',
  amountCents: number = 9900,
  options: Partial<MockInvoiceData> = {}
): MockInvoiceData {
  return {
    id: FIXED_IDS.INVOICE_ID,
    tenant_id: tenantId,
    stripe_invoice_id: FIXED_IDS.STRIPE_INVOICE_ID,
    stripe_customer_id: FIXED_IDS.STRIPE_CUSTOMER_ID,
    amount_cents: amountCents,
    currency: 'BRL',
    status,
    due_date: null,
    paid_at: status === 'paid' ? FIXED_TIMESTAMP_ISO : null,
    hosted_invoice_url: 'https://invoice.stripe.com/test',
    invoice_pdf: null,
    description: null,
    created_at: FIXED_TIMESTAMP_ISO,
    updated_at: FIXED_TIMESTAMP_ISO,
    ...options,
  };
}

/** Factory: create payment data (DETERMINISTIC) */
export function makePayment(
  tenantId: string,
  status: string = 'succeeded',
  amountCents: number = 9900,
  options: Partial<MockPaymentData> = {}
): MockPaymentData {
  return {
    id: FIXED_IDS.PAYMENT_ID,
    tenant_id: tenantId,
    stripe_payment_intent_id: FIXED_IDS.PAYMENT_INTENT_ID,
    amount_cents: amountCents,
    currency: 'BRL',
    status,
    method: 'card',
    created_at: FIXED_TIMESTAMP_ISO,
    updated_at: FIXED_TIMESTAMP_ISO,
    ...options,
  };
}

/** Factory: create multiple invoices with deterministic IDs */
export function makeInvoiceList(
  tenantId: string,
  statuses: string[] = ['paid', 'open']
): MockInvoiceData[] {
  return statuses.map((status, index) => ({
    id: index === 0 ? FIXED_IDS.INVOICE_ID : FIXED_IDS.INVOICE_ID_2,
    tenant_id: tenantId,
    stripe_invoice_id: index === 0 ? FIXED_IDS.STRIPE_INVOICE_ID : FIXED_IDS.STRIPE_INVOICE_ID_2,
    stripe_customer_id: FIXED_IDS.STRIPE_CUSTOMER_ID,
    amount_cents: 9900,
    currency: 'BRL',
    status,
    due_date: null,
    paid_at: status === 'paid' ? FIXED_TIMESTAMP_ISO : null,
    hosted_invoice_url: 'https://invoice.stripe.com/test',
    invoice_pdf: null,
    description: null,
    created_at: FIXED_TIMESTAMP_ISO,
    updated_at: FIXED_TIMESTAMP_ISO,
  }));
}
