/**
 * PI U11 — PROGRESS_FEEDBACK (Pure Derivation)
 *
 * Positive reinforcement ONLY when real progress occurred.
 * No gamification, no noise, no lies.
 *
 * CONTRACT:
 * - Never unlocks anything
 * - Never grants access
 * - Never replaces blockers
 * - Only acknowledges validated progress
 * - Depends on U9 (fail-closed) + U10 (next best action)
 *   → If the system blocks or guides, it does NOT celebrate.
 *
 * NO React, NO Supabase, NO side effects.
 */

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
 *
 * Decision order:
 * 1. Security (fail-closed) — loading/error/no-access → null
 * 2. Event existence — no event → null
 * 3. Known mapping — unknown event → null
 * 4. Return feedback
 */
export function deriveProgressFeedback(
  input: ProgressFeedbackInput,
): ProgressFeedback | null {
  // 1. Fail-closed: system not ready or access denied → no celebration
  if (input.isLoading) return null;
  if (input.isError) return null;
  if (!input.canAccess) return null;

  // 2. No event → nothing to celebrate
  if (!input.lastEvent) return null;

  // 3. Known mapping only
  const feedback = EVENT_MAP[input.lastEvent];
  if (!feedback) return null;

  return feedback;
}
