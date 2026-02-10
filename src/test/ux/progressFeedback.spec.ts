/**
 * PI U11 — PROGRESS_FEEDBACK — Deterministic Tests (U8-compliant)
 *
 * Validates the pure derivation of ProgressFeedback from institutional state.
 * No React, no mocks, no timers — pure function tests.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveProgressFeedback,
  type ProgressFeedbackInput,
} from '@/lib/ux/progressFeedback';

// ── Helpers ────────────────────────────────────────────────────────────────

function okInput(overrides: Partial<ProgressFeedbackInput> = {}): ProgressFeedbackInput {
  return {
    lastEvent: null,
    canAccess: true,
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

// ============================================================================
// T1 — No event → null
// ============================================================================
describe('No event', () => {
  it('returns null when no event is provided', () => {
    expect(deriveProgressFeedback(okInput())).toBeNull();
  });

  it('returns null when lastEvent is null', () => {
    expect(deriveProgressFeedback(okInput({ lastEvent: null }))).toBeNull();
  });

  it('returns null when lastEvent is undefined', () => {
    expect(deriveProgressFeedback(okInput({ lastEvent: undefined }))).toBeNull();
  });
});

// ============================================================================
// T2 — Fail-closed (U9 dependency)
// ============================================================================
describe('Fail-closed', () => {
  it('returns null when loading', () => {
    expect(deriveProgressFeedback(okInput({
      lastEvent: 'WIZARD_COMPLETED',
      isLoading: true,
    }))).toBeNull();
  });

  it('returns null when error', () => {
    expect(deriveProgressFeedback(okInput({
      lastEvent: 'WIZARD_COMPLETED',
      isError: true,
    }))).toBeNull();
  });

  it('returns null when access denied', () => {
    expect(deriveProgressFeedback(okInput({
      lastEvent: 'WIZARD_COMPLETED',
      canAccess: false,
    }))).toBeNull();
  });
});

// ============================================================================
// T3 — Wizard completed
// ============================================================================
describe('WIZARD_COMPLETED', () => {
  it('returns SUCCESS feedback', () => {
    const result = deriveProgressFeedback(okInput({ lastEvent: 'WIZARD_COMPLETED' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('SUCCESS');
    expect(result!.event).toBe('WIZARD_COMPLETED');
    expect(result!.messageKey).toBe('progress.wizardCompleted');
  });
});

// ============================================================================
// T4 — Billing regularized
// ============================================================================
describe('BILLING_REGULARIZED', () => {
  it('returns SUCCESS feedback', () => {
    const result = deriveProgressFeedback(okInput({ lastEvent: 'BILLING_REGULARIZED' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('SUCCESS');
    expect(result!.event).toBe('BILLING_REGULARIZED');
    expect(result!.messageKey).toBe('progress.billingRegularized');
  });
});

// ============================================================================
// T5 — Tenant activated
// ============================================================================
describe('TENANT_ACTIVATED', () => {
  it('returns INFO feedback', () => {
    const result = deriveProgressFeedback(okInput({ lastEvent: 'TENANT_ACTIVATED' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('INFO');
    expect(result!.event).toBe('TENANT_ACTIVATED');
    expect(result!.messageKey).toBe('progress.tenantActivated');
  });
});

// ============================================================================
// T6 — First app access
// ============================================================================
describe('FIRST_APP_ACCESS', () => {
  it('returns INFO feedback', () => {
    const result = deriveProgressFeedback(okInput({ lastEvent: 'FIRST_APP_ACCESS' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('INFO');
    expect(result!.event).toBe('FIRST_APP_ACCESS');
    expect(result!.messageKey).toBe('progress.firstAccess');
  });
});

// ============================================================================
// T7 — Unknown event → null
// ============================================================================
describe('Unknown event', () => {
  it('returns null for unknown event string', () => {
    const result = deriveProgressFeedback(okInput({
      lastEvent: 'SOME_UNKNOWN_EVENT' as any,
    }));
    expect(result).toBeNull();
  });
});
