/**
 * PAYMENTS/INVOICES SAFE GOLD — Normalizers v1.0
 *
 * Pure functions. No Date, Math, UUID, or IO.
 */

import type {
  SafeInvoiceStatus,
  SafePaymentStatus,
} from '@/types/payments-invoices-state';

import {
  PROD_INVOICE_TO_SAFE,
  PROD_PAYMENT_TO_SAFE,
} from '@/types/payments-invoices-state';

/**
 * Assert invoice status belongs to SAFE GOLD subset
 */
export function assertInvoiceStatus(v: string | null | undefined): SafeInvoiceStatus {
  if (!v) return 'OPEN';
  return PROD_INVOICE_TO_SAFE[v.toLowerCase()] ?? 'OPEN';
}

/**
 * Assert payment status belongs to SAFE GOLD subset
 */
export function assertPaymentStatus(v: string | null | undefined): SafePaymentStatus {
  if (!v) return 'PENDING';
  return PROD_PAYMENT_TO_SAFE[v.toLowerCase()] ?? 'PENDING';
}
