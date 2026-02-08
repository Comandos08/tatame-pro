/**
 * BILLING SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado.
 * NÃO representa o domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 * 
 * NOTE: Production code uses src/lib/billing/resolveTenantBillingState.ts
 * This is a TEST CONTRACT ONLY.
 */

export type SafeBillingStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'BLOCKED';

export type SafeBillingSource =
  | 'STRIPE'
  | 'MANUAL';

export type BillingViewState =
  | 'LOADING'
  | 'READY'
  | 'ERROR';

export const SAFE_BILLING_STATUSES: readonly SafeBillingStatus[] = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'BLOCKED',
] as const;

export const SAFE_BILLING_SOURCES: readonly SafeBillingSource[] = [
  'STRIPE',
  'MANUAL',
] as const;

export const SAFE_BILLING_VIEW_STATES: readonly BillingViewState[] = [
  'LOADING',
  'READY',
  'ERROR',
] as const;

/**
 * Maps production status to SAFE GOLD subset
 */
export const PRODUCTION_TO_SAFE_STATUS: Record<string, SafeBillingStatus> = {
  'ACTIVE': 'ACTIVE',
  'TRIALING': 'TRIAL',
  'TRIAL_EXPIRED': 'TRIAL',
  'PAST_DUE': 'PAST_DUE',
  'CANCELED': 'CANCELED',
  'PENDING_DELETE': 'BLOCKED',
  'UNPAID': 'BLOCKED',
  'INCOMPLETE': 'BLOCKED',
};
