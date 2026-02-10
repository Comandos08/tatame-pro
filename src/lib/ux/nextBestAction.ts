/**
 * PI U10 — NEXT_BEST_ACTION (Pure Derivation)
 *
 * Derives the single most important action the user should take NOW.
 * Now consumes BlockReason (U12) as SSoT for blocked states.
 *
 * CONTRACT:
 * - Never grants access
 * - Never executes actions
 * - Only suggests
 * - Always fail-closed (null = nothing to suggest = system OK)
 *
 * NO React, NO Supabase, NO side effects.
 */

import type { IdentityState } from '@/contexts/IdentityContext';
import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';
import type { BillingStatus } from '@/lib/billing';
import { deriveBlockReason, type BlockReason } from './blockReason';

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

// ── BlockReason → NBA mapping ──────────────────────────────────────────────

const BLOCK_REASON_TO_NBA: Record<string, NextBestAction> = {
  IDENTITY_LOADING: {
    kind: 'INFO',
    labelKey: 'nba.waitingIdentity',
    reason: 'IDENTITY_LOADING',
  },
  BILLING_BLOCKED: {
    kind: 'CTA',
    labelKey: 'nba.fixBilling',
    href: '/app/billing',
    reason: 'BILLING_BLOCKED',
  },
  TENANT_BLOCKED: {
    kind: 'INFO',
    labelKey: 'nba.contactAdmin',
    reason: 'TENANT_BLOCKED',
  },
  NO_PERMISSION: {
    kind: 'INFO',
    labelKey: 'nba.noPermission',
    reason: 'ACCESS_DENIED',
  },
};

// ── Derivation ─────────────────────────────────────────────────────────────

/**
 * Derive the next best action from the current institutional state.
 *
 * Priority:
 * 1. Identity loading → INFO (from U12)
 * 2. Wizard required → CTA (identity-specific, not a BlockReason)
 * 3. BlockReason (billing/tenant/permission) → mapped NBA
 * 4. Everything OK → null
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

  // 2. Wizard required — identity-specific, not a generic BlockReason
  if (input.identityState === 'wizard_required') {
    return {
      kind: 'CTA',
      labelKey: 'nba.completeSetup',
      href: '/identity/wizard',
      reason: 'WIZARD_REQUIRED',
    };
  }

  // 3. Derive block reason via U12 SSoT
  const blockReason = deriveBlockReason({
    isLoading: false, // already handled above
    canAccess: input.canAccess,
    tenantLifecycle: input.tenantLifecycle,
    billingStatus: input.billingStatus,
  });

  if (blockReason && BLOCK_REASON_TO_NBA[blockReason]) {
    return BLOCK_REASON_TO_NBA[blockReason];
  }

  // 4. Everything OK → no suggestion needed
  return null;
}
