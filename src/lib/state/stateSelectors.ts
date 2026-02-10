/**
 * PI U5 — STATE SELECTORS (Pure Derivation Functions)
 *
 * Composite state derivations that combine multiple canonical states
 * into higher-level operational facts.
 *
 * No hooks. No React. No side effects.
 * Only calculation.
 *
 * FROZEN CONTRACT — changes require explicit PI approval.
 */

import type {
  TenantLifecycleStatus,
  SubscriptionStatus,
} from './stateDefinitions';

import type { BillingStatus } from '@/lib/billing';

// ============================================================================
// 🏢 TENANT OPERATIONAL STATE
// ============================================================================

export interface TenantOperationalState {
  /** Tenant can serve /app/* and perform write operations */
  canOperate: boolean;
  /** Tenant is in read-only mode (degraded billing or non-ACTIVE) */
  isReadOnly: boolean;
}

/**
 * Derives the combined operational state of a tenant
 * from its lifecycle + subscription status.
 */
export function deriveTenantOperationalState(
  tenantStatus: TenantLifecycleStatus,
  subscriptionStatus: SubscriptionStatus,
): TenantOperationalState {
  return {
    canOperate:
      tenantStatus === 'ACTIVE' &&
      subscriptionStatus !== 'SUSPENDED' &&
      subscriptionStatus !== 'CANCELLED',

    isReadOnly:
      tenantStatus !== 'ACTIVE' ||
      subscriptionStatus === 'PAST_DUE',
  };
}

// ============================================================================
// 💳 TRIAL PRESENTATION STATE
// ============================================================================

export interface TrialPresentationState {
  /** Trial is active and counting down */
  isTrialActive: boolean;
  /** Trial is ending within warning threshold */
  isTrialEndingSoon: boolean;
  /** Days remaining until trial end (null if not in trial) */
  daysToTrialEnd: number | null;
}

/**
 * Derives trial-related presentation flags.
 * Pure calculation — no side effects.
 */
export function deriveTrialPresentationState(
  billingStatus: BillingStatus | null,
  currentPeriodEnd: Date | null,
  warningDays: number = 7,
): TrialPresentationState {
  const isTrialActive = billingStatus === 'TRIALING';

  const daysToTrialEnd = (() => {
    if (!isTrialActive || !currentPeriodEnd) return null;
    const now = new Date();
    const diffTime = currentPeriodEnd.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  })();

  const isTrialEndingSoon =
    isTrialActive &&
    daysToTrialEnd !== null &&
    daysToTrialEnd <= warningDays &&
    daysToTrialEnd > 0;

  return {
    isTrialActive,
    isTrialEndingSoon,
    daysToTrialEnd,
  };
}
