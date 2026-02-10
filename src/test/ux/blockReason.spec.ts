/**
 * PI U12 — BLOCK_REASON_CLARITY — Deterministic Tests (U8-compliant)
 *
 * Validates priority order, fail-closed behavior, and semantic correctness
 * of the block reason derivation. Pure function tests — no React, no mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveBlockReason,
  BLOCK_REASON_UI,
  BLOCK_REASON_I18N,
  type BlockReasonContext,
} from '@/lib/ux/blockReason';

// ── Helpers ────────────────────────────────────────────────────────────────

function okCtx(overrides: Partial<BlockReasonContext> = {}): BlockReasonContext {
  return {
    isLoading: false,
    canAccess: true,
    tenantLifecycle: 'ACTIVE',
    billingStatus: 'ACTIVE',
    featureEnabled: true,
    hasData: true,
    ...overrides,
  };
}

// ============================================================================
// T1 — Happy path → null
// ============================================================================
describe('Happy path', () => {
  it('returns null when everything is OK', () => {
    expect(deriveBlockReason(okCtx())).toBeNull();
  });
});

// ============================================================================
// T2 — Loading (highest priority)
// ============================================================================
describe('Loading', () => {
  it('returns IDENTITY_LOADING', () => {
    expect(deriveBlockReason(okCtx({ isLoading: true }))).toBe('IDENTITY_LOADING');
  });

  it('loading beats tenant blocked', () => {
    expect(deriveBlockReason(okCtx({ isLoading: true, tenantLifecycle: 'BLOCKED' }))).toBe('IDENTITY_LOADING');
  });

  it('loading beats billing blocked', () => {
    expect(deriveBlockReason(okCtx({ isLoading: true, billingStatus: 'PAST_DUE' }))).toBe('IDENTITY_LOADING');
  });

  it('loading beats no permission', () => {
    expect(deriveBlockReason(okCtx({ isLoading: true, canAccess: false }))).toBe('IDENTITY_LOADING');
  });
});

// ============================================================================
// T3 — Tenant blocked
// ============================================================================
describe('Tenant blocked', () => {
  it('BLOCKED → TENANT_BLOCKED', () => {
    expect(deriveBlockReason(okCtx({ tenantLifecycle: 'BLOCKED' }))).toBe('TENANT_BLOCKED');
  });

  it('DELETED → TENANT_BLOCKED', () => {
    expect(deriveBlockReason(okCtx({ tenantLifecycle: 'DELETED' }))).toBe('TENANT_BLOCKED');
  });

  it('tenant blocked beats billing', () => {
    expect(deriveBlockReason(okCtx({ tenantLifecycle: 'BLOCKED', billingStatus: 'PAST_DUE' }))).toBe('TENANT_BLOCKED');
  });

  it('SETUP does not trigger', () => {
    expect(deriveBlockReason(okCtx({ tenantLifecycle: 'SETUP' }))).toBeNull();
  });

  it('ACTIVE does not trigger', () => {
    expect(deriveBlockReason(okCtx({ tenantLifecycle: 'ACTIVE' }))).toBeNull();
  });
});

// ============================================================================
// T4 — Billing blocked
// ============================================================================
describe('Billing blocked', () => {
  it('PAST_DUE → BILLING_BLOCKED', () => {
    expect(deriveBlockReason(okCtx({ billingStatus: 'PAST_DUE' }))).toBe('BILLING_BLOCKED');
  });

  it('UNPAID → BILLING_BLOCKED', () => {
    expect(deriveBlockReason(okCtx({ billingStatus: 'UNPAID' }))).toBe('BILLING_BLOCKED');
  });

  it('PENDING_DELETE → BILLING_BLOCKED', () => {
    expect(deriveBlockReason(okCtx({ billingStatus: 'PENDING_DELETE' }))).toBe('BILLING_BLOCKED');
  });

  it('billing beats no permission', () => {
    expect(deriveBlockReason(okCtx({ billingStatus: 'PAST_DUE', canAccess: false }))).toBe('BILLING_BLOCKED');
  });

  it('ACTIVE does not trigger', () => {
    expect(deriveBlockReason(okCtx({ billingStatus: 'ACTIVE' }))).toBeNull();
  });

  it('TRIALING does not trigger', () => {
    expect(deriveBlockReason(okCtx({ billingStatus: 'TRIALING' }))).toBeNull();
  });
});

// ============================================================================
// T5 — No permission
// ============================================================================
describe('No permission', () => {
  it('returns NO_PERMISSION', () => {
    expect(deriveBlockReason(okCtx({ canAccess: false }))).toBe('NO_PERMISSION');
  });

  it('permission beats feature disabled', () => {
    expect(deriveBlockReason(okCtx({ canAccess: false, featureEnabled: false }))).toBe('NO_PERMISSION');
  });

  it('permission beats no data', () => {
    expect(deriveBlockReason(okCtx({ canAccess: false, hasData: false }))).toBe('NO_PERMISSION');
  });
});

// ============================================================================
// T6 — Feature disabled
// ============================================================================
describe('Feature disabled', () => {
  it('returns FEATURE_DISABLED', () => {
    expect(deriveBlockReason(okCtx({ featureEnabled: false }))).toBe('FEATURE_DISABLED');
  });

  it('feature disabled beats no data', () => {
    expect(deriveBlockReason(okCtx({ featureEnabled: false, hasData: false }))).toBe('FEATURE_DISABLED');
  });

  it('undefined featureEnabled does not trigger', () => {
    expect(deriveBlockReason(okCtx({ featureEnabled: undefined }))).toBeNull();
  });
});

// ============================================================================
// T7 — No data
// ============================================================================
describe('No data', () => {
  it('returns NO_DATA', () => {
    expect(deriveBlockReason(okCtx({ hasData: false }))).toBe('NO_DATA');
  });

  it('undefined hasData does not trigger', () => {
    expect(deriveBlockReason(okCtx({ hasData: undefined }))).toBeNull();
  });
});

// ============================================================================
// T8 — Null values (edge cases)
// ============================================================================
describe('Null values', () => {
  it('null billing does not trigger', () => {
    expect(deriveBlockReason(okCtx({ billingStatus: null }))).toBeNull();
  });

  it('null tenant does not trigger', () => {
    expect(deriveBlockReason(okCtx({ tenantLifecycle: null }))).toBeNull();
  });
});

// ============================================================================
// T9 — UI and i18n mapping completeness
// ============================================================================
describe('Mapping completeness', () => {
  const ALL_REASONS: Array<ReturnType<typeof deriveBlockReason>> = [
    'IDENTITY_LOADING', 'TENANT_BLOCKED', 'BILLING_BLOCKED',
    'NO_PERMISSION', 'FEATURE_DISABLED', 'NO_DATA',
  ];

  it('every reason has a UI mapping', () => {
    for (const reason of ALL_REASONS) {
      if (reason) {
        expect(BLOCK_REASON_UI[reason]).toBeDefined();
        expect(BLOCK_REASON_UI[reason].kind).toBeTruthy();
        expect(BLOCK_REASON_UI[reason].icon).toBeTruthy();
      }
    }
  });

  it('every reason has i18n keys', () => {
    for (const reason of ALL_REASONS) {
      if (reason) {
        expect(BLOCK_REASON_I18N[reason]).toBeDefined();
        expect(BLOCK_REASON_I18N[reason].titleKey).toBeTruthy();
        expect(BLOCK_REASON_I18N[reason].descriptionKey).toBeTruthy();
      }
    }
  });
});
