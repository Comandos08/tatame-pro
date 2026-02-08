/**
 * BILLING UX SAFE GOLD — v1.1
 *
 * Contrato mínimo, estável e congelado.
 * Apenas estes estados são considerados válidos.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

export const SAFE_BILLING_STATES = [
  'ACTIVE',
  'INCOMPLETE',
  'PAST_DUE',
  'UNPAID',
  'CANCELED',
] as const;

export type BillingState = typeof SAFE_BILLING_STATES[number];

export const SAFE_BILLING_VIEW_STATES = [
  'READY',
  'BLOCKED',
  'WARNING',
  'ERROR',
] as const;

export type BillingViewState = typeof SAFE_BILLING_VIEW_STATES[number];
