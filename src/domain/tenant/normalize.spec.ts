import { describe, it, expect } from 'vitest';
import { assertTenantLifecycleState } from './normalize';

describe('assertTenantLifecycleState', () => {
  // Direct SAFE GOLD matches
  it.each(['SETUP', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'TERMINATED', 'DELETED'] as const)(
    'returns %s for direct match',
    (state) => {
      expect(assertTenantLifecycleState(state)).toBe(state);
    }
  );

  // Production → SAFE GOLD mappings
  it('maps PENDING_DELETE to BLOCKED', () => {
    expect(assertTenantLifecycleState('PENDING_DELETE')).toBe('BLOCKED');
  });

  // Null/undefined → SETUP fallback
  it('returns SETUP for null', () => {
    expect(assertTenantLifecycleState(null)).toBe('SETUP');
  });

  it('returns SETUP for undefined', () => {
    expect(assertTenantLifecycleState(undefined)).toBe('SETUP');
  });

  it('returns SETUP for empty string', () => {
    expect(assertTenantLifecycleState('')).toBe('SETUP');
  });

  // Case normalization
  it('handles lowercase input', () => {
    expect(assertTenantLifecycleState('active')).toBe('ACTIVE');
  });

  // Unknown → SETUP fallback
  it('falls back to SETUP for unknown value', () => {
    expect(assertTenantLifecycleState('INVENTED')).toBe('SETUP');
  });
});
