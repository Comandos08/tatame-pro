/**
 * BILLING UX SAFE GOLD — v1.1
 *
 * Pure normalizer functions for billing UX state.
 * Zero side effects. Zero dependencies on context.
 */

import type { BillingState, BillingViewState } from '@/types/billing-view-state';
import { SAFE_BILLING_STATES, SAFE_BILLING_VIEW_STATES } from '@/types/billing-view-state';

/**
 * Normalize raw billing status to SAFE GOLD subset.
 * Unknown values default to CANCELED (safest fallback).
 */
export function normalizeBillingState(
  rawStatus?: string | null
): BillingState {
  if (!rawStatus) return 'CANCELED';
  
  const upper = rawStatus.toUpperCase();
  
  switch (upper) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'INCOMPLETE':
      return 'INCOMPLETE';
    case 'PAST_DUE':
      return 'PAST_DUE';
    case 'UNPAID':
      return 'UNPAID';
    case 'CANCELED':
    case 'CANCELLED':
      return 'CANCELED';
    default:
      return 'CANCELED';
  }
}

/**
 * Derive view state from billing state.
 * Pure function, deterministic mapping.
 */
export function deriveBillingViewState(
  state: BillingState
): BillingViewState {
  switch (state) {
    case 'ACTIVE':
      return 'READY';
    case 'INCOMPLETE':
      return 'WARNING';
    case 'PAST_DUE':
    case 'UNPAID':
      return 'BLOCKED';
    case 'CANCELED':
    default:
      return 'ERROR';
  }
}

/**
 * Assert billing state belongs to SAFE GOLD subset
 */
export function assertBillingState(v: string): BillingState {
  const upper = v.toUpperCase();
  if (SAFE_BILLING_STATES.includes(upper as BillingState)) {
    return upper as BillingState;
  }
  return 'CANCELED';
}

/**
 * Assert billing view state belongs to SAFE GOLD subset
 */
export function assertBillingViewState(v: string): BillingViewState {
  const upper = v.toUpperCase();
  if (SAFE_BILLING_VIEW_STATES.includes(upper as BillingViewState)) {
    return upper as BillingViewState;
  }
  return 'ERROR';
}
