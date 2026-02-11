/**
 * PI U10 — NEXT_BEST_ACTION — Deterministic Tests (U8-compliant)
 *
 * Validates the pure derivation of NextBestAction from institutional state.
 * No React, no mocks, no timers — pure function tests.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveNextBestAction,
  type NextBestActionInput,
} from '@/lib/ux/nextBestAction';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Base "everything OK" input — should produce null */
function okInput(overrides: Partial<NextBestActionInput> = {}): NextBestActionInput {
  return {
    identityState: 'resolved',
    tenantLifecycle: 'ACTIVE',
    billingStatus: 'ACTIVE',
    hasTenant: true,
    hasRole: true,
    canAccess: true,
    ...overrides,
  };
}

// ============================================================================
// T1 — Happy Path → null (no suggestion)
// ============================================================================
describe('Happy path', () => {
  it('returns null when all systems are resolved and accessible', () => {
    expect(deriveNextBestAction(okInput())).toBeNull();
  });

  it('returns null for superadmin identity', () => {
    expect(deriveNextBestAction(okInput({ identityState: 'superadmin' }))).toBeNull();
  });
});

// ============================================================================
// T2 — Identity Loading
// ============================================================================
describe('Identity loading', () => {
  it('returns INFO with IDENTITY_LOADING reason', () => {
    const result = deriveNextBestAction(okInput({ identityState: 'loading' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('INFO');
    expect(result!.reason).toBe('IDENTITY_LOADING');
    expect(result!.labelKey).toBe('nba.waitingIdentity');
  });
});

// ============================================================================
// T3 — Wizard Required
// ============================================================================
describe('Wizard required', () => {
  it('returns CTA with WIZARD_REQUIRED reason and correct href', () => {
    const result = deriveNextBestAction(okInput({ identityState: 'wizard_required' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('CTA');
    expect(result!.reason).toBe('WIZARD_REQUIRED');
    expect((result as { href: string }).href).toBe('/identity/wizard');
  });
});

// ============================================================================
// T4 — Billing Blocked
// ============================================================================
describe('Billing blocked', () => {
  it('returns CTA for PAST_DUE billing', () => {
    const result = deriveNextBestAction(okInput({ billingStatus: 'PAST_DUE' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('CTA');
    expect(result!.reason).toBe('BILLING_BLOCKED');
    expect((result as { href: string }).href).toBe('/app/billing');
  });

  it('returns CTA for UNPAID billing', () => {
    const result = deriveNextBestAction(okInput({ billingStatus: 'UNPAID' }));
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('BILLING_BLOCKED');
  });

  it('returns CTA for PENDING_DELETE billing', () => {
    const result = deriveNextBestAction(okInput({ billingStatus: 'PENDING_DELETE' }));
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('BILLING_BLOCKED');
  });

  it('does NOT trigger for TRIALING billing', () => {
    const result = deriveNextBestAction(okInput({ billingStatus: 'TRIALING' }));
    expect(result).toBeNull();
  });

  it('does NOT trigger for ACTIVE billing', () => {
    const result = deriveNextBestAction(okInput({ billingStatus: 'ACTIVE' }));
    expect(result).toBeNull();
  });
});

// ============================================================================
// T5 — Tenant Blocked
// ============================================================================
describe('Tenant blocked', () => {
  it('returns INFO for BLOCKED tenant', () => {
    const result = deriveNextBestAction(okInput({ tenantLifecycle: 'BLOCKED' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('INFO');
    expect(result!.reason).toBe('TENANT_BLOCKED');
    expect(result!.labelKey).toBe('nba.contactAdmin');
  });

  it('returns INFO for DELETED tenant', () => {
    const result = deriveNextBestAction(okInput({ tenantLifecycle: 'DELETED' }));
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });

  it('does NOT trigger for SETUP tenant', () => {
    const result = deriveNextBestAction(okInput({ tenantLifecycle: 'SETUP' }));
    expect(result).toBeNull();
  });
});

// ============================================================================
// T6 — Access Denied (U9 fail-closed)
// ============================================================================
describe('Access denied', () => {
  it('returns INFO with ACCESS_DENIED when canAccess is false', () => {
    const result = deriveNextBestAction(okInput({ canAccess: false }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('INFO');
    expect(result!.reason).toBe('ACCESS_DENIED');
    expect(result!.labelKey).toBe('nba.noPermission');
  });
});

// ============================================================================
// T7 — Priority order
// ============================================================================
describe('Priority order', () => {
  it('Identity loading takes priority over billing blocked', () => {
    const result = deriveNextBestAction(okInput({
      identityState: 'loading',
      billingStatus: 'PAST_DUE',
    }));
    expect(result!.reason).toBe('IDENTITY_LOADING');
  });

  it('Wizard takes priority over billing blocked', () => {
    const result = deriveNextBestAction(okInput({
      identityState: 'wizard_required',
      billingStatus: 'PAST_DUE',
    }));
    expect(result!.reason).toBe('WIZARD_REQUIRED');
  });

  it('Tenant blocked takes priority over billing blocked', () => {
    const result = deriveNextBestAction(okInput({
      billingStatus: 'PAST_DUE',
      tenantLifecycle: 'BLOCKED',
    }));
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });

  it('Tenant blocked takes priority over access denied', () => {
    const result = deriveNextBestAction(okInput({
      tenantLifecycle: 'BLOCKED',
      canAccess: false,
    }));
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });

  it('Billing override neutralizes financial block when tenant is ACTIVE', () => {
    const result = deriveNextBestAction(okInput({
      billingStatus: 'PAST_DUE',
      billingOverride: true,
      tenantLifecycle: 'ACTIVE',
    }));
    expect(result).toBeNull();
  });

  it('Billing override does NOT override tenant BLOCKED lifecycle', () => {
    const result = deriveNextBestAction(okInput({
      billingStatus: 'PAST_DUE',
      billingOverride: true,
      tenantLifecycle: 'BLOCKED',
    }));
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });

  it('Billing override does NOT override tenant DELETED lifecycle', () => {
    const result = deriveNextBestAction(okInput({
      billingStatus: 'PAST_DUE',
      billingOverride: true,
      tenantLifecycle: 'DELETED',
    }));
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });
});

// ============================================================================
// T8 — Null billing status (unknown)
// ============================================================================
describe('Null/missing billing', () => {
  it('does not trigger billing blocked when status is null', () => {
    const result = deriveNextBestAction(okInput({ billingStatus: null }));
    expect(result).toBeNull();
  });
});

// ============================================================================
// T9 — Hierarchy determinism (institutional blindagem)
// ============================================================================
describe('Hierarchy determinism', () => {
  it('returns exactly one reason — the highest precedence — when multiple blocks coexist', () => {
    const result = deriveNextBestAction(okInput({
      identityState: 'loading',
      tenantLifecycle: 'BLOCKED',
      billingStatus: 'PAST_DUE',
      canAccess: false,
    }));
    expect(result).not.toBeNull();
    expect(result!.reason).toBe('IDENTITY_LOADING');
  });

  it('wizard_required outranks all downstream blocks', () => {
    const result = deriveNextBestAction(okInput({
      identityState: 'wizard_required',
      tenantLifecycle: 'BLOCKED',
      billingStatus: 'PAST_DUE',
      canAccess: false,
    }));
    expect(result!.reason).toBe('WIZARD_REQUIRED');
  });

  it('tenant DELETED outranks billing + access denied', () => {
    const result = deriveNextBestAction(okInput({
      tenantLifecycle: 'DELETED',
      billingStatus: 'UNPAID',
      canAccess: false,
    }));
    expect(result!.reason).toBe('TENANT_BLOCKED');
  });

  it('billing blocked outranks access denied when no override', () => {
    const result = deriveNextBestAction(okInput({
      billingStatus: 'PAST_DUE',
      canAccess: false,
    }));
    expect(result!.reason).toBe('BILLING_BLOCKED');
  });

  it('access denied surfaces when billing is overridden and tenant is ACTIVE', () => {
    const result = deriveNextBestAction(okInput({
      billingStatus: 'PAST_DUE',
      billingOverride: true,
      canAccess: false,
    }));
    expect(result!.reason).toBe('ACCESS_DENIED');
  });
});
