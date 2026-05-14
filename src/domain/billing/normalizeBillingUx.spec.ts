import { describe, it, expect } from 'vitest';
import {
  normalizeBillingState,
  deriveBillingViewState,
  assertBillingState,
  assertBillingViewState,
} from './normalizeBillingUx';
import {
  SAFE_BILLING_STATES,
  SAFE_BILLING_VIEW_STATES,
} from '@/types/billing-view-state';

// ============================================================================
// normalizeBillingState — coercion of raw Supabase status to SAFE GOLD subset
// ============================================================================

describe('normalizeBillingState', () => {
  it.each(['ACTIVE', 'INCOMPLETE', 'PAST_DUE', 'UNPAID', 'CANCELED'] as const)(
    'preserves canonical %s unchanged',
    (status) => {
      expect(normalizeBillingState(status)).toBe(status);
    },
  );

  it('accepts lowercase canonical values via toUpperCase', () => {
    expect(normalizeBillingState('active')).toBe('ACTIVE');
    expect(normalizeBillingState('past_due')).toBe('PAST_DUE');
  });

  it('treats UK spelling CANCELLED as CANCELED', () => {
    expect(normalizeBillingState('CANCELLED')).toBe('CANCELED');
    expect(normalizeBillingState('cancelled')).toBe('CANCELED');
  });

  it('returns CANCELED for null input (safest fallback)', () => {
    expect(normalizeBillingState(null)).toBe('CANCELED');
  });

  it('returns CANCELED for undefined input', () => {
    expect(normalizeBillingState(undefined)).toBe('CANCELED');
  });

  it('returns CANCELED for empty string', () => {
    expect(normalizeBillingState('')).toBe('CANCELED');
  });

  it('returns CANCELED for unknown status (fail-safe block)', () => {
    expect(normalizeBillingState('INVENTED')).toBe('CANCELED');
    expect(normalizeBillingState('trialing')).toBe('CANCELED'); // TRIALING is not in SAFE GOLD UX subset
    expect(normalizeBillingState('pending_delete')).toBe('CANCELED');
  });

  it('every output is a member of SAFE_BILLING_STATES', () => {
    const inputs = ['ACTIVE', 'unknown', null, undefined, '', 'foo', 'cancelled'];
    for (const input of inputs) {
      const out = normalizeBillingState(input as string | null);
      expect(SAFE_BILLING_STATES).toContain(out);
    }
  });
});

// ============================================================================
// deriveBillingViewState — state → view-state mapping
// ============================================================================

describe('deriveBillingViewState', () => {
  it('ACTIVE → READY', () => {
    expect(deriveBillingViewState('ACTIVE')).toBe('READY');
  });

  it('INCOMPLETE → WARNING', () => {
    expect(deriveBillingViewState('INCOMPLETE')).toBe('WARNING');
  });

  it('PAST_DUE → BLOCKED', () => {
    expect(deriveBillingViewState('PAST_DUE')).toBe('BLOCKED');
  });

  it('UNPAID → BLOCKED', () => {
    expect(deriveBillingViewState('UNPAID')).toBe('BLOCKED');
  });

  it('CANCELED → ERROR', () => {
    expect(deriveBillingViewState('CANCELED')).toBe('ERROR');
  });

  it('every SAFE_BILLING_STATES member produces a SAFE_BILLING_VIEW_STATES value', () => {
    for (const state of SAFE_BILLING_STATES) {
      expect(SAFE_BILLING_VIEW_STATES).toContain(deriveBillingViewState(state));
    }
  });
});

// ============================================================================
// assertBillingState — string → SAFE GOLD coercion
// ============================================================================

describe('assertBillingState', () => {
  it.each(SAFE_BILLING_STATES)('passes through %s', (state) => {
    expect(assertBillingState(state)).toBe(state);
  });

  it('uppercases input before checking', () => {
    expect(assertBillingState('active')).toBe('ACTIVE');
    expect(assertBillingState('past_due')).toBe('PAST_DUE');
  });

  it('falls back to CANCELED for unknown', () => {
    expect(assertBillingState('INVENTED')).toBe('CANCELED');
    expect(assertBillingState('')).toBe('CANCELED');
  });

  it('does not accept the UK spelling CANCELLED (only normalizeBillingState does)', () => {
    // assertBillingState is a strict guard; the substring match for CANCELLED
    // happens in normalizeBillingState. Here it falls through to fallback.
    expect(assertBillingState('CANCELLED')).toBe('CANCELED');
    // (Both happen to produce CANCELED — but via different paths.)
  });
});

// ============================================================================
// assertBillingViewState
// ============================================================================

describe('assertBillingViewState', () => {
  it.each(SAFE_BILLING_VIEW_STATES)('passes through %s', (state) => {
    expect(assertBillingViewState(state)).toBe(state);
  });

  it('uppercases input', () => {
    expect(assertBillingViewState('ready')).toBe('READY');
    expect(assertBillingViewState('blocked')).toBe('BLOCKED');
  });

  it('falls back to ERROR for unknown', () => {
    expect(assertBillingViewState('INVENTED')).toBe('ERROR');
    expect(assertBillingViewState('')).toBe('ERROR');
  });
});
