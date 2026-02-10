/**
 * PI U5 — STATE GUARDS (Pure Functions)
 *
 * Deterministic boolean checks against canonical states.
 * No hooks. No React. No side effects.
 *
 * Every behavioral "if" in the system should call one of these
 * instead of comparing strings inline.
 *
 * FROZEN CONTRACT — changes require explicit PI approval.
 */

import type {
  TenantLifecycleStatus,
  MembershipStatus,
  SubscriptionStatus,
} from './stateDefinitions';

import type { BillingStatus } from '@/lib/billing';

// ============================================================================
// 🏢 TENANT GUARDS
// ============================================================================

/** Tenant can serve /app/* and perform operations */
export function canTenantOperate(status: TenantLifecycleStatus): boolean {
  return status === 'ACTIVE';
}

/** Tenant exists but is blocked (read-only + institutional notice) */
export function isTenantSuspended(status: TenantLifecycleStatus): boolean {
  return status === 'SUSPENDED';
}

/** Tenant is in onboarding flow */
export function isTenantInSetup(status: TenantLifecycleStatus): boolean {
  return status === 'SETUP';
}

/** Tenant is permanently inaccessible */
export function isTenantTerminal(status: TenantLifecycleStatus): boolean {
  return status === 'INACTIVE' || status === 'DELETED';
}

// ============================================================================
// 👤 MEMBERSHIP GUARDS
// ============================================================================

/** Membership allows check-in, diplomas, and full participation */
export function isMembershipValid(status: MembershipStatus): boolean {
  return status === 'ACTIVE';
}

/** Membership is awaiting approval */
export function isMembershipPending(status: MembershipStatus): boolean {
  return status === 'PENDING';
}

/** Membership reached a terminal state (no further transitions) */
export function isMembershipTerminal(status: MembershipStatus): boolean {
  return status === 'EXPIRED' || status === 'CANCELLED';
}

// ============================================================================
// 💳 SUBSCRIPTION GUARDS
// ============================================================================

/** Subscription is causing institutional block */
export function isSubscriptionBlocking(status: SubscriptionStatus): boolean {
  return status === 'SUSPENDED' || status === 'CANCELLED';
}

/** Subscription is degraded but not yet blocking */
export function isSubscriptionDegraded(status: SubscriptionStatus): boolean {
  return status === 'PAST_DUE';
}

/** Subscription is fully operational */
export function isSubscriptionHealthy(status: SubscriptionStatus): boolean {
  return status === 'ACTIVE' || status === 'TRIAL';
}

// ============================================================================
// 💳 BILLING GUARDS (BillingStatus from resolver)
// ============================================================================

/** Billing status indicates trial is active */
export function isBillingTrialActive(status: BillingStatus): boolean {
  return status === 'TRIALING';
}

/** Billing status indicates trial has expired (grace period) */
export function isBillingTrialExpired(status: BillingStatus): boolean {
  return status === 'TRIAL_EXPIRED';
}

/** Billing status indicates tenant is pending deletion */
export function isBillingPendingDelete(status: BillingStatus): boolean {
  return status === 'PENDING_DELETE';
}

/** Sensitive actions (approve members, issue diplomas, etc.) are blocked */
export function areSensitiveActionsBlocked(status: BillingStatus): boolean {
  return status === 'TRIAL_EXPIRED' || status === 'PENDING_DELETE';
}
