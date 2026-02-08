/**
 * PAYMENTS/INVOICES SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado.
 * NÃO representa o domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

export type SafeInvoiceStatus =
  | 'PAID'
  | 'OPEN'
  | 'OVERDUE'
  | 'VOID';

export type SafePaymentStatus =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'PENDING'
  | 'REFUNDED';

export const SAFE_INVOICE_STATUSES: readonly SafeInvoiceStatus[] = [
  'PAID',
  'OPEN',
  'OVERDUE',
  'VOID',
] as const;

export const SAFE_PAYMENT_STATUSES: readonly SafePaymentStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'PENDING',
  'REFUNDED',
] as const;

/**
 * Production → SAFE GOLD mapping (invoices)
 */
export const PROD_INVOICE_TO_SAFE: Record<string, SafeInvoiceStatus> = {
  paid: 'PAID',
  open: 'OPEN',
  draft: 'OPEN',
  overdue: 'OVERDUE',
  void: 'VOID',
  uncollectible: 'VOID',
};

/**
 * Production → SAFE GOLD mapping (payments)
 */
export const PROD_PAYMENT_TO_SAFE: Record<string, SafePaymentStatus> = {
  succeeded: 'SUCCEEDED',
  failed: 'FAILED',
  pending: 'PENDING',
  refunded: 'REFUNDED',
  processing: 'PENDING',
  requires_payment_method: 'PENDING',
  requires_confirmation: 'PENDING',
  requires_action: 'PENDING',
  canceled: 'FAILED',
};
