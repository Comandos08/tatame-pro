/**
 * PI U11 — PROGRESS_FEEDBACK (Pure Derivation)
 *
 * Positive reinforcement ONLY when real progress occurred.
 * Now uses BlockReason (U12) to ensure no celebration during blocks.
 *
 * CONTRACT:
 * - Never unlocks anything
 * - Never grants access
 * - If BlockReason exists → no celebration
 * - Only acknowledges validated progress
 *
 * NO React, NO Supabase, NO side effects.
 */

import { deriveBlockReason } from './blockReason';

// ── Types ──────────────────────────────────────────────────────────────────

export type ProgressFeedbackKind = 'SUCCESS' | 'INFO';

export type ProgressEvent =
  | 'WIZARD_COMPLETED'
  | 'BILLING_REGULARIZED'
  | 'TENANT_ACTIVATED'
  | 'FIRST_APP_ACCESS';

export interface ProgressFeedback {
  kind: ProgressFeedbackKind;
  messageKey: string;
  event: ProgressEvent;
}

export interface ProgressFeedbackInput {
  lastEvent?: ProgressEvent | null;
  canAccess: boolean;
  isLoading: boolean;
  isError: boolean;
}

// ── Event → Feedback mapping ───────────────────────────────────────────────

const EVENT_MAP: Record<ProgressEvent, ProgressFeedback> = {
  WIZARD_COMPLETED: {
    kind: 'SUCCESS',
    messageKey: 'progress.wizardCompleted',
    event: 'WIZARD_COMPLETED',
  },
  BILLING_REGULARIZED: {
    kind: 'SUCCESS',
    messageKey: 'progress.billingRegularized',
    event: 'BILLING_REGULARIZED',
  },
  TENANT_ACTIVATED: {
    kind: 'INFO',
    messageKey: 'progress.tenantActivated',
    event: 'TENANT_ACTIVATED',
  },
  FIRST_APP_ACCESS: {
    kind: 'INFO',
    messageKey: 'progress.firstAccess',
    event: 'FIRST_APP_ACCESS',
  },
};

// ── Derivation ─────────────────────────────────────────────────────────────

/**
 * Derive progress feedback from the current state.
 * Uses U12 BlockReason to determine if the system is blocked.
 *
 * Decision order:
 * 1. Security (fail-closed) — loading/error → null
 * 2. BlockReason exists → null (don't celebrate during blocks)
 * 3. Event existence — no event → null
 * 4. Known mapping — unknown event → null
 * 5. Return feedback
 */
export function deriveProgressFeedback(
  input: ProgressFeedbackInput,
): ProgressFeedback | null {
  // 1. Fail-closed: system not ready
  if (input.isLoading) return null;
  if (input.isError) return null;

  // 2. Use U12 to check for blocks (don't celebrate during blocks)
  const blockReason = deriveBlockReason({
    isLoading: input.isLoading,
    canAccess: input.canAccess,
    tenantLifecycle: null,
    billingStatus: null,
  });
  if (blockReason) return null;

  // 3. No event → nothing to celebrate
  if (!input.lastEvent) return null;

  // 4. Known mapping only
  const feedback = EVENT_MAP[input.lastEvent];
  if (!feedback) return null;

  return feedback;
}
