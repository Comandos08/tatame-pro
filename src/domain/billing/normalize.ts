/**
 * BILLING SAFE GOLD — v1.0
 *
 * Pure normalizer functions for billing state.
 * Used for E2E contract tests only.
 */

import type {
  SafeBillingStatus,
  SafeBillingSource,
  BillingViewState,
} from '@/types/billing-state';

import { PRODUCTION_TO_SAFE_STATUS } from '@/types/billing-state';

const STATUS: SafeBillingStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'BLOCKED'];
const SOURCE: SafeBillingSource[] = ['STRIPE', 'MANUAL'];
const VIEW: BillingViewState[] = ['LOADING', 'READY', 'ERROR'];

/**
 * Assert billing status belongs to SAFE GOLD subset
 */
export function assertBillingStatus(v: string): SafeBillingStatus {
  // First try direct match
  if (STATUS.includes(v as SafeBillingStatus)) {
    return v as SafeBillingStatus;
  }
  // Then try production-to-safe mapping
  const mapped = PRODUCTION_TO_SAFE_STATUS[v.toUpperCase()];
  return mapped ?? 'BLOCKED';
}

export function assertBillingSource(v: string): SafeBillingSource {
  const upper = v.toUpperCase();
  if (upper === 'MANUAL_OVERRIDE') return 'MANUAL';
  return SOURCE.includes(upper as SafeBillingSource)
    ? (upper as SafeBillingSource)
    : 'STRIPE';
}

export function assertBillingViewState(v: string): BillingViewState {
  return VIEW.includes(v as BillingViewState)
    ? (v as BillingViewState)
    : 'ERROR';
}
