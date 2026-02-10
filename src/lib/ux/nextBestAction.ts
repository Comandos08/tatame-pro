/**
 * PI U10 — NEXT_BEST_ACTION (Pure Derivation)
 *
 * Derives the single most important action the user should take NOW,
 * based on the current institutional state.
 *
 * CONTRACT:
 * - Never grants access
 * - Never executes actions
 * - Only suggests
 * - Always fail-closed (null = nothing to suggest = system OK)
 * - Derived exclusively from explicit state
 *
 * NO React, NO Supabase, NO side effects.
 */

import type { IdentityState } from '@/contexts/IdentityContext';
import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';
import type { BillingStatus } from '@/lib/billing';

// ── Types ──────────────────────────────────────────────────────────────────

export type NextBestAction =
  | {
      kind: 'CTA';
      labelKey: string;
      href: string;
      reason: NextBestActionReason;
    }
  | {
      kind: 'INFO';
      labelKey: string;
      reason: NextBestActionReason;
    }
  | null;

export type NextBestActionReason =
  | 'IDENTITY_LOADING'
  | 'WIZARD_REQUIRED'
  | 'BILLING_BLOCKED'
  | 'TENANT_BLOCKED'
  | 'ACCESS_DENIED';

export interface NextBestActionInput {
  identityState: IdentityState;
  tenantLifecycle: TenantLifecycleState | null;
  billingStatus: BillingStatus | null;
  hasTenant: boolean;
  hasRole: boolean;
  canAccess: boolean;
}

// ── Derivation ─────────────────────────────────────────────────────────────

/**
 * Derive the next best action from the current institutional state.
 * Priority order mirrors the access resolver:
 *   Identity → Billing → Tenant → Access → OK
 */
export function deriveNextBestAction(
  input: NextBestActionInput,
): NextBestAction {
  // 1. Identity not resolved — user must wait
  if (input.identityState === 'loading') {
    return {
      kind: 'INFO',
      labelKey: 'nba.waitingIdentity',
      reason: 'IDENTITY_LOADING',
    };
  }

  // 2. Wizard required — user must complete onboarding
  if (input.identityState === 'wizard_required') {
    return {
      kind: 'CTA',
      labelKey: 'nba.completeSetup',
      href: '/identity/wizard',
      reason: 'WIZARD_REQUIRED',
    };
  }

  // 3. Billing blocked — user must fix payment
  if (
    input.billingStatus === 'PAST_DUE' ||
    input.billingStatus === 'UNPAID' ||
    input.billingStatus === 'PENDING_DELETE'
  ) {
    return {
      kind: 'CTA',
      labelKey: 'nba.fixBilling',
      href: '/app/billing',
      reason: 'BILLING_BLOCKED',
    };
  }

  // 4. Tenant blocked — user must contact admin
  if (input.tenantLifecycle === 'BLOCKED' || input.tenantLifecycle === 'DELETED') {
    return {
      kind: 'INFO',
      labelKey: 'nba.contactAdmin',
      reason: 'TENANT_BLOCKED',
    };
  }

  // 5. Access denied (U9 fail-closed) — user lacks permission
  if (!input.canAccess) {
    return {
      kind: 'INFO',
      labelKey: 'nba.noPermission',
      reason: 'ACCESS_DENIED',
    };
  }

  // 6. Everything OK → no suggestion needed
  return null;
}
