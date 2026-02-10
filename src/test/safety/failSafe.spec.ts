/**
 * PI U9 — FAIL_SAFE_DEFAULTS — Deterministic Tests (U8-compliant)
 *
 * Validates that all fail-safe helpers enforce deny-by-default
 * and that the system never leaks access through intermediate states.
 */

import { describe, it, expect } from 'vitest';
import {
  failSafeBoolean,
  failSafeString,
  failSafeArray,
  failSafeObject,
  failSafeEnum,
  failSafeAccess,
  failSafeRenderGate,
} from '@/lib/safety/failSafe';

// ============================================================================
// failSafeBoolean
// ============================================================================
describe('failSafeBoolean', () => {
  it('returns false for undefined', () => {
    expect(failSafeBoolean(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(failSafeBoolean(null)).toBe(false);
  });

  it('returns false for non-boolean values', () => {
    expect(failSafeBoolean('true')).toBe(false);
    expect(failSafeBoolean(1)).toBe(false);
    expect(failSafeBoolean({})).toBe(false);
  });

  it('preserves explicit true', () => {
    expect(failSafeBoolean(true)).toBe(true);
  });

  it('preserves explicit false', () => {
    expect(failSafeBoolean(false)).toBe(false);
  });

  it('uses custom fallback when input is not boolean', () => {
    expect(failSafeBoolean(undefined, true)).toBe(true);
  });
});

// ============================================================================
// failSafeString
// ============================================================================
describe('failSafeString', () => {
  it('returns empty string for undefined', () => {
    expect(failSafeString(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(failSafeString(null)).toBe('');
  });

  it('preserves valid string', () => {
    expect(failSafeString('hello')).toBe('hello');
  });

  it('returns fallback for number', () => {
    expect(failSafeString(42, 'fallback')).toBe('fallback');
  });
});

// ============================================================================
// failSafeArray
// ============================================================================
describe('failSafeArray', () => {
  it('returns empty array for undefined', () => {
    expect(failSafeArray(undefined)).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(failSafeArray(null)).toEqual([]);
  });

  it('returns empty array for non-array object', () => {
    expect(failSafeArray({})).toEqual([]);
  });

  it('preserves valid array', () => {
    expect(failSafeArray([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

// ============================================================================
// failSafeObject
// ============================================================================
describe('failSafeObject', () => {
  it('returns empty object for undefined', () => {
    expect(failSafeObject(undefined)).toEqual({});
  });

  it('returns empty object for null', () => {
    expect(failSafeObject(null)).toEqual({});
  });

  it('returns empty object for array', () => {
    expect(failSafeObject([1, 2])).toEqual({});
  });

  it('preserves valid object', () => {
    expect(failSafeObject({ a: 1 })).toEqual({ a: 1 });
  });
});

// ============================================================================
// failSafeEnum
// ============================================================================
describe('failSafeEnum', () => {
  const ALLOWED = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;

  it('returns fallback for undefined', () => {
    expect(failSafeEnum(undefined, ALLOWED, 'SUSPENDED')).toBe('SUSPENDED');
  });

  it('returns fallback for invalid value', () => {
    expect(failSafeEnum('HACKED', ALLOWED, 'SUSPENDED')).toBe('SUSPENDED');
  });

  it('preserves valid enum member', () => {
    expect(failSafeEnum('ACTIVE', ALLOWED, 'SUSPENDED')).toBe('ACTIVE');
  });
});

// ============================================================================
// failSafeAccess — CORE SECURITY CONTRACT
// ============================================================================
describe('failSafeAccess', () => {
  it('denies when loading', () => {
    expect(failSafeAccess(true, true, false)).toBe(false);
  });

  it('denies when error', () => {
    expect(failSafeAccess(true, false, true)).toBe(false);
  });

  it('denies when canValue is undefined', () => {
    expect(failSafeAccess(undefined)).toBe(false);
  });

  it('denies when canValue is null', () => {
    expect(failSafeAccess(null)).toBe(false);
  });

  it('denies when canValue is false', () => {
    expect(failSafeAccess(false, false, false)).toBe(false);
  });

  it('allows ONLY when canValue is true and no loading/error', () => {
    expect(failSafeAccess(true, false, false)).toBe(true);
  });

  it('denies when both loading and error', () => {
    expect(failSafeAccess(true, true, true)).toBe(false);
  });
});

// ============================================================================
// failSafeRenderGate
// ============================================================================
describe('failSafeRenderGate', () => {
  it('returns LOADING when isLoading', () => {
    expect(failSafeRenderGate({ isLoading: true, isError: false, isGranted: true })).toBe('LOADING');
  });

  it('returns DENY on error', () => {
    expect(failSafeRenderGate({ isLoading: false, isError: true, isGranted: true })).toBe('DENY');
  });

  it('returns DENY when not granted', () => {
    expect(failSafeRenderGate({ isLoading: false, isError: false, isGranted: false })).toBe('DENY');
  });

  it('returns ALLOW only when resolved and granted', () => {
    expect(failSafeRenderGate({ isLoading: false, isError: false, isGranted: true })).toBe('ALLOW');
  });

  it('LOADING takes priority over DENY', () => {
    expect(failSafeRenderGate({ isLoading: true, isError: true, isGranted: false })).toBe('LOADING');
  });
});
