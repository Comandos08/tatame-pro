/**
 * PI U13 — EMPTY_STATE_AUTHORITY — Deterministic Tests (U8-compliant)
 *
 * Validates priority order, fail-closed behavior, and semantic correctness
 * of the empty state derivation. Pure function tests — no React, no mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveEmptyState,
  type EmptyStateInput,
} from '@/lib/ux/emptyStateAuthority';

// ── Helpers ────────────────────────────────────────────────────────────────

function okInput(overrides: Partial<EmptyStateInput> = {}): EmptyStateInput {
  return {
    hasData: true,
    canAccess: true,
    isLoading: false,
    tenantLifecycle: 'ACTIVE',
    billingStatus: 'ACTIVE',
    featureEnabled: true,
    ...overrides,
  };
}

// ============================================================================
// T1 — Happy path → null
// ============================================================================
describe('Happy path', () => {
  it('returns null when data exists and everything is OK', () => {
    expect(deriveEmptyState(okInput())).toBeNull();
  });
});

// ============================================================================
// T2 — Loading (highest priority)
// ============================================================================
describe('Loading', () => {
  it('returns WAITING with IDENTITY_LOADING', () => {
    const result = deriveEmptyState(okInput({ isLoading: true }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('WAITING');
    expect(result!.reason).toBe('IDENTITY_LOADING');
    expect(result!.icon).toBe('CLOCK');
  });

  it('loading takes priority over tenant blocked', () => {
    const result = deriveEmptyState(okInput({
      isLoading: true,
      tenantLifecycle: 'BLOCKED',
    }));
    expect(result!.reason).toBe('IDENTITY_LOADING');
  });

  it('loading takes priority over billing blocked', () => {
    const result = deriveEmptyState(okInput({
      isLoading: true,
      billingStatus: 'PAST_DUE',
    }));
    expect(result!.reason).toBe('IDENTITY_LOADING');
  });
});

// ============================================================================
// T3 — Tenant blocked
// ============================================================================
describe('Tenant blocked', () => {
  it('returns BLOCKED for BLOCKED tenant', () => {
    const result = deriveEmptyState(okInput({ tenantLifecycle: 'BLOCKED' }));
    expect(result!.kind).toBe('BLOCKED');
    expect(result!.reason).toBe('TENANT_BLOCKED');
    expect(result!.icon).toBe('LOCK');
  });

  it('returns BLOCKED for DELETED tenant', () => {
    const result = deriveEmptyState(okInput({ tenantLifecycle: 'DELETED' }));
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });

  it('tenant blocked takes priority over billing', () => {
    const result = deriveEmptyState(okInput({
      tenantLifecycle: 'BLOCKED',
      billingStatus: 'PAST_DUE',
    }));
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });

  it('does NOT trigger for SETUP tenant', () => {
    const result = deriveEmptyState(okInput({ tenantLifecycle: 'SETUP' }));
    expect(result).toBeNull();
  });

  it('does NOT trigger for ACTIVE tenant', () => {
    const result = deriveEmptyState(okInput({ tenantLifecycle: 'ACTIVE' }));
    expect(result).toBeNull();
  });
});

// ============================================================================
// T4 — Billing blocked
// ============================================================================
describe('Billing blocked', () => {
  it('returns BLOCKED for PAST_DUE', () => {
    const result = deriveEmptyState(okInput({ billingStatus: 'PAST_DUE' }));
    expect(result!.kind).toBe('BLOCKED');
    expect(result!.reason).toBe('BILLING_BLOCKED');
  });

  it('returns BLOCKED for UNPAID', () => {
    const result = deriveEmptyState(okInput({ billingStatus: 'UNPAID' }));
    expect(result!.reason).toBe('BILLING_BLOCKED');
  });

  it('returns BLOCKED for PENDING_DELETE', () => {
    const result = deriveEmptyState(okInput({ billingStatus: 'PENDING_DELETE' }));
    expect(result!.reason).toBe('BILLING_BLOCKED');
  });

  it('billing takes priority over no permission', () => {
    const result = deriveEmptyState(okInput({
      billingStatus: 'PAST_DUE',
      canAccess: false,
    }));
    expect(result!.reason).toBe('BILLING_BLOCKED');
  });

  it('does NOT trigger for ACTIVE billing', () => {
    expect(deriveEmptyState(okInput({ billingStatus: 'ACTIVE' }))).toBeNull();
  });

  it('does NOT trigger for TRIALING billing', () => {
    expect(deriveEmptyState(okInput({ billingStatus: 'TRIALING' }))).toBeNull();
  });
});

// ============================================================================
// T5 — No permission
// ============================================================================
describe('No permission', () => {
  it('returns BLOCKED with NO_PERMISSION', () => {
    const result = deriveEmptyState(okInput({ canAccess: false }));
    expect(result!.kind).toBe('BLOCKED');
    expect(result!.reason).toBe('NO_PERMISSION');
    expect(result!.icon).toBe('LOCK');
  });

  it('permission takes priority over feature disabled', () => {
    const result = deriveEmptyState(okInput({
      canAccess: false,
      featureEnabled: false,
    }));
    expect(result!.reason).toBe('NO_PERMISSION');
  });

  it('permission takes priority over no data', () => {
    const result = deriveEmptyState(okInput({
      canAccess: false,
      hasData: false,
    }));
    expect(result!.reason).toBe('NO_PERMISSION');
  });
});

// ============================================================================
// T6 — Feature disabled
// ============================================================================
describe('Feature disabled', () => {
  it('returns INFO with FEATURE_DISABLED', () => {
    const result = deriveEmptyState(okInput({ featureEnabled: false }));
    expect(result!.kind).toBe('INFO');
    expect(result!.reason).toBe('FEATURE_DISABLED');
    expect(result!.icon).toBe('INFO');
  });

  it('feature disabled takes priority over no data', () => {
    const result = deriveEmptyState(okInput({
      featureEnabled: false,
      hasData: false,
    }));
    expect(result!.reason).toBe('FEATURE_DISABLED');
  });

  it('does NOT trigger when featureEnabled is undefined', () => {
    expect(deriveEmptyState(okInput({ featureEnabled: undefined }))).toBeNull();
  });
});

// ============================================================================
// T7 — No data
// ============================================================================
describe('No data', () => {
  it('returns INFO with NO_DATA', () => {
    const result = deriveEmptyState(okInput({ hasData: false }));
    expect(result!.kind).toBe('INFO');
    expect(result!.reason).toBe('NO_DATA');
    expect(result!.icon).toBe('INFO');
  });
});

// ============================================================================
// T8 — Null billing/tenant (edge cases)
// ============================================================================
describe('Null values', () => {
  it('null billing does not trigger billing blocked', () => {
    expect(deriveEmptyState(okInput({ billingStatus: null }))).toBeNull();
  });

  it('null tenant does not trigger tenant blocked', () => {
    expect(deriveEmptyState(okInput({ tenantLifecycle: null }))).toBeNull();
  });
});
