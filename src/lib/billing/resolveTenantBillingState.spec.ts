import { describe, it, expect } from 'vitest';
import { resolveTenantBillingState } from './resolveTenantBillingState';

// ============================================================================
// FALLBACK (null inputs)
// ============================================================================
describe('resolveTenantBillingState — fallback', () => {
  it('returns restrictive state when billing is null', () => {
    const result = resolveTenantBillingState(null, { is_active: true });
    expect(result.status).toBe('INCOMPLETE');
    expect(result.isActive).toBe(false);
    expect(result.isBlocked).toBe(true);
    expect(result.isReadOnly).toBe(true);
    expect(result.canPerformSensitiveActions).toBe(false);
    expect(result.isSuspended).toBe(true);
  });

  it('returns restrictive state when tenant is null', () => {
    const result = resolveTenantBillingState(
      { status: 'ACTIVE', is_manual_override: false },
      null
    );
    expect(result.isActive).toBe(false);
    expect(result.isBlocked).toBe(true);
  });

  it('returns restrictive state when both are null', () => {
    const result = resolveTenantBillingState(null, null);
    expect(result.status).toBe('INCOMPLETE');
    expect(result.isBlocked).toBe(true);
    expect(result.canUseStripe).toBe(true);
    expect(result.source).toBe('STRIPE');
  });

  it('preserves isManualOverride in fallback when billing has override', () => {
    const result = resolveTenantBillingState(
      { status: null, is_manual_override: true },
      null
    );
    expect(result.isManualOverride).toBe(true);
    expect(result.canUseStripe).toBe(false);
    expect(result.source).toBe('MANUAL_OVERRIDE');
  });
});

// ============================================================================
// ACTIVE STATUS
// ============================================================================
describe('resolveTenantBillingState — ACTIVE', () => {
  it('resolves ACTIVE with active tenant', () => {
    const result = resolveTenantBillingState(
      { status: 'ACTIVE', is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('ACTIVE');
    expect(result.isActive).toBe(true);
    expect(result.isBlocked).toBe(false);
    expect(result.isReadOnly).toBe(false);
    expect(result.canPerformSensitiveActions).toBe(true);
    expect(result.isSuspended).toBe(false);
  });

  it('resolves ACTIVE as blocked when tenant is inactive', () => {
    const result = resolveTenantBillingState(
      { status: 'ACTIVE', is_manual_override: false },
      { is_active: false }
    );
    expect(result.isActive).toBe(false);
    expect(result.isBlocked).toBe(true);
  });
});

// ============================================================================
// TRIALING STATUS
// ============================================================================
describe('resolveTenantBillingState — TRIALING', () => {
  it('resolves TRIALING as active trial', () => {
    const result = resolveTenantBillingState(
      { status: 'TRIALING', is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('TRIALING');
    expect(result.isActive).toBe(true);
    expect(result.isTrialActive).toBe(true);
    expect(result.isTrialExpired).toBe(false);
    expect(result.canPerformSensitiveActions).toBe(true);
  });
});

// ============================================================================
// TRIAL_EXPIRED STATUS
// ============================================================================
describe('resolveTenantBillingState — TRIAL_EXPIRED', () => {
  it('resolves TRIAL_EXPIRED as read-only with blocked sensitive actions', () => {
    const result = resolveTenantBillingState(
      { status: 'TRIAL_EXPIRED', is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('TRIAL_EXPIRED');
    expect(result.isTrialExpired).toBe(true);
    expect(result.isReadOnly).toBe(true);
    expect(result.canPerformSensitiveActions).toBe(false);
    expect(result.isSuspended).toBe(false);
  });
});

// ============================================================================
// PENDING_DELETE STATUS
// ============================================================================
describe('resolveTenantBillingState — PENDING_DELETE', () => {
  it('resolves PENDING_DELETE as blocked and suspended', () => {
    const result = resolveTenantBillingState(
      { status: 'PENDING_DELETE', is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('PENDING_DELETE');
    expect(result.isPendingDelete).toBe(true);
    expect(result.isBlocked).toBe(true);
    expect(result.isSuspended).toBe(true);
    expect(result.canPerformSensitiveActions).toBe(false);
  });
});

// ============================================================================
// CANCELED STATUS
// ============================================================================
describe('resolveTenantBillingState — CANCELED', () => {
  it('resolves CANCELED as blocked and suspended', () => {
    const result = resolveTenantBillingState(
      { status: 'CANCELED', is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('CANCELED');
    expect(result.isBlocked).toBe(true);
    expect(result.isSuspended).toBe(true);
  });
});

// ============================================================================
// PAST_DUE, UNPAID, INCOMPLETE — Read-only states
// ============================================================================
describe('resolveTenantBillingState — degraded states', () => {
  it.each(['PAST_DUE', 'UNPAID', 'INCOMPLETE'] as const)('resolves %s as read-only', (status) => {
    const result = resolveTenantBillingState(
      { status, is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe(status);
    expect(result.isReadOnly).toBe(true);
    expect(result.canPerformSensitiveActions).toBe(false);
  });
});

// ============================================================================
// MANUAL OVERRIDE
// ============================================================================
describe('resolveTenantBillingState — manual override', () => {
  it('ignores tenant.is_active when manual override is active', () => {
    const result = resolveTenantBillingState(
      { status: 'ACTIVE', is_manual_override: true },
      { is_active: false }
    );
    expect(result.isManualOverride).toBe(true);
    expect(result.isActive).toBe(true);
    expect(result.canUseStripe).toBe(false);
    expect(result.source).toBe('MANUAL_OVERRIDE');
  });

  it('manual override TRIALING still counts as active', () => {
    const result = resolveTenantBillingState(
      { status: 'TRIALING', is_manual_override: true },
      { is_active: false }
    );
    expect(result.isActive).toBe(true);
    expect(result.isTrialActive).toBe(true);
  });

  it('manual override with CANCELED is not active', () => {
    const result = resolveTenantBillingState(
      { status: 'CANCELED', is_manual_override: true },
      { is_active: false }
    );
    expect(result.isActive).toBe(false);
    expect(result.isBlocked).toBe(true);
  });
});

// ============================================================================
// INVALID / UNKNOWN STATUS
// ============================================================================
describe('resolveTenantBillingState — invalid status', () => {
  it('normalizes unknown status to INCOMPLETE', () => {
    const result = resolveTenantBillingState(
      { status: 'INVENTED_STATUS', is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('INCOMPLETE');
    expect(result.isReadOnly).toBe(true);
  });

  it('normalizes null status to INCOMPLETE', () => {
    const result = resolveTenantBillingState(
      { status: null, is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('INCOMPLETE');
  });

  it('normalizes lowercase status correctly', () => {
    const result = resolveTenantBillingState(
      { status: 'active', is_manual_override: false },
      { is_active: true }
    );
    expect(result.status).toBe('ACTIVE');
    expect(result.isActive).toBe(true);
  });
});

// ============================================================================
// OVERRIDE METADATA
// ============================================================================
describe('resolveTenantBillingState — override metadata', () => {
  it('preserves override_reason and override_at', () => {
    const result = resolveTenantBillingState(
      {
        status: 'ACTIVE',
        is_manual_override: true,
        override_reason: 'Parceiro estratégico',
        override_at: '2026-01-15T10:00:00Z',
      },
      { is_active: true }
    );
    expect(result.overrideReason).toBe('Parceiro estratégico');
    expect(result.overrideAt).toEqual(new Date('2026-01-15T10:00:00Z'));
  });

  it('returns null for missing override metadata', () => {
    const result = resolveTenantBillingState(
      { status: 'ACTIVE', is_manual_override: false },
      { is_active: true }
    );
    expect(result.overrideReason).toBeNull();
    expect(result.overrideAt).toBeNull();
  });
});
