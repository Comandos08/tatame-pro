/**
 * Billing State Machine — A03 SAFE GOLD
 *
 * Deterministic state machine for tenant billing lifecycle.
 * All transitions must be explicitly allowed.
 * Fail-closed: invalid transitions throw (never return boolean).
 *
 * A02: Zero console.* — uses createBackendLogger if needed by callers.
 */

/**
 * Canonical billing statuses.
 * Maps 1:1 with tenant_billing.status column values.
 */
export type BillingStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "UNPAID"
  | "CANCELED"
  | "INCOMPLETE"
  | "TRIAL_EXPIRED"
  | "PENDING_DELETE";

/**
 * Runtime array for membership checks (Adjustment 1).
 */
export const BILLING_STATUSES: readonly BillingStatus[] = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "UNPAID",
  "CANCELED",
  "INCOMPLETE",
  "TRIAL_EXPIRED",
  "PENDING_DELETE",
] as const;

/**
 * Type guard: validates if a value is a known BillingStatus (Adjustment 1).
 * Handles null, undefined, numbers, objects — never throws.
 */
export function isKnownBillingStatus(value: unknown): value is BillingStatus {
  if (typeof value !== "string") return false;
  return (BILLING_STATUSES as readonly string[]).includes(value);
}

/**
 * Explicit transition map (Adjustment 2).
 * CANCELED is reachable from every non-terminal state.
 * CANCELED itself is terminal (no outgoing transitions).
 */
const ALLOWED_TRANSITIONS: Record<BillingStatus, readonly BillingStatus[]> = {
  TRIALING: ["ACTIVE", "TRIAL_EXPIRED", "CANCELED"],
  ACTIVE: ["PAST_DUE", "CANCELED"],
  PAST_DUE: ["ACTIVE", "UNPAID", "CANCELED"],
  UNPAID: ["ACTIVE", "CANCELED"],
  CANCELED: [],
  INCOMPLETE: ["ACTIVE", "CANCELED"],
  TRIAL_EXPIRED: ["ACTIVE", "PENDING_DELETE", "CANCELED"],
  PENDING_DELETE: ["ACTIVE", "CANCELED"],
};

/**
 * Fail-closed transition validator.
 * Throws on invalid transition — never returns boolean.
 *
 * @throws Error if transition is not in ALLOWED_TRANSITIONS
 */
export function assertValidBillingTransition(
  from: BillingStatus,
  to: BillingStatus,
): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Invalid billing transition: ${from} → ${to}`);
  }
}

/**
 * Pure derivation of tenants.is_active from billing status.
 * Single source of truth — replaces all inline boolean logic.
 */
export function deriveTenantActive(status: BillingStatus): boolean {
  return status === "ACTIVE" || status === "TRIALING";
}

/**
 * Post-update consistency check.
 * Verifies that tenants.is_active matches the expected value for the billing status.
 * Detection-only safety net — callers should catch and audit, never 500.
 *
 * @throws Error if is_active does not match expected value
 */
export function assertBillingConsistency(
  billingStatus: BillingStatus,
  tenantIsActive: boolean,
): void {
  const expected = deriveTenantActive(billingStatus);
  if (expected !== tenantIsActive) {
    throw new Error(
      `Billing consistency mismatch: status=${billingStatus} expects is_active=${expected}, got ${tenantIsActive}`,
    );
  }
}

/**
 * Maps Stripe subscription status to canonical BillingStatus.
 * Single source of truth — used by stripe-webhook and create-tenant-subscription.
 *
 * @param stripeStatus - Stripe subscription.status string
 * @returns Canonical BillingStatus
 */
export function mapStripeStatusToBilling(stripeStatus: string): BillingStatus {
  const statusMap: Record<string, BillingStatus> = {
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    incomplete: "INCOMPLETE",
    trialing: "TRIALING",
    unpaid: "UNPAID",
    incomplete_expired: "CANCELED",
    paused: "PAST_DUE",
  };
  return statusMap[stripeStatus] || "INCOMPLETE";
}
