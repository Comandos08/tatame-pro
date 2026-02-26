import { describe, it, expect } from 'vitest';
import { assertBillingStatus, assertBillingSource, assertBillingViewState } from './normalize';

describe('assertBillingStatus', () => {
  // Direct SAFE GOLD matches
  it.each(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'BLOCKED'] as const)(
    'returns %s for direct match',
    (status) => {
      expect(assertBillingStatus(status)).toBe(status);
    }
  );

  // Production → SAFE GOLD mappings
  it('maps TRIALING to TRIAL', () => {
    expect(assertBillingStatus('TRIALING')).toBe('TRIAL');
  });

  it('maps TRIAL_EXPIRED to TRIAL', () => {
    expect(assertBillingStatus('TRIAL_EXPIRED')).toBe('TRIAL');
  });

  it('maps PENDING_DELETE to BLOCKED', () => {
    expect(assertBillingStatus('PENDING_DELETE')).toBe('BLOCKED');
  });

  it('maps UNPAID to BLOCKED', () => {
    expect(assertBillingStatus('UNPAID')).toBe('BLOCKED');
  });

  it('maps INCOMPLETE to BLOCKED', () => {
    expect(assertBillingStatus('INCOMPLETE')).toBe('BLOCKED');
  });

  // Case normalization
  it('handles lowercase input via toUpperCase', () => {
    expect(assertBillingStatus('active')).toBe('ACTIVE');
  });

  // Unknown → fallback
  it('falls back to BLOCKED for unknown status', () => {
    expect(assertBillingStatus('INVENTED')).toBe('BLOCKED');
  });

  it('falls back to BLOCKED for empty string', () => {
    expect(assertBillingStatus('')).toBe('BLOCKED');
  });
});

describe('assertBillingSource', () => {
  it('returns STRIPE for STRIPE', () => {
    expect(assertBillingSource('STRIPE')).toBe('STRIPE');
  });

  it('returns MANUAL for MANUAL', () => {
    expect(assertBillingSource('MANUAL')).toBe('MANUAL');
  });

  it('maps MANUAL_OVERRIDE to MANUAL', () => {
    expect(assertBillingSource('MANUAL_OVERRIDE')).toBe('MANUAL');
  });

  it('falls back to STRIPE for unknown', () => {
    expect(assertBillingSource('UNKNOWN')).toBe('STRIPE');
  });

  it('handles lowercase', () => {
    expect(assertBillingSource('stripe')).toBe('STRIPE');
  });
});

describe('assertBillingViewState', () => {
  it.each(['LOADING', 'READY', 'ERROR'] as const)(
    'returns %s for valid value',
    (state) => {
      expect(assertBillingViewState(state)).toBe(state);
    }
  );

  it('falls back to ERROR for unknown', () => {
    expect(assertBillingViewState('INVENTED')).toBe('ERROR');
  });
});
