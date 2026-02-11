/**
 * PI U17 — TRUST_NARRATIVE — Deterministic Tests (U8-compliant)
 *
 * Validates derivation, fail-closed behavior, and mapping completeness.
 * Pure function tests — no React, no mocks.
 */

import { describe, it, expect } from 'vitest';
import { deriveTrustNarrative, type TrustNarrative } from '@/lib/ux/trustNarrative';
import type { BlockReason } from '@/lib/ux/blockReason';

// ── All block reasons ──────────────────────────────────────────────────────

const ALL_REASONS: BlockReason[] = [
  'IDENTITY_LOADING',
  'TENANT_BLOCKED',
  'BILLING_BLOCKED',
  'NO_PERMISSION',
  'FEATURE_DISABLED',
  'NO_DATA',
];

// ============================================================================
// T1 — Happy path → null
// ============================================================================
describe('Happy path', () => {
  it('returns null when no blockReason', () => {
    expect(deriveTrustNarrative(null)).toBeNull();
  });
});

// ============================================================================
// T2 — Every BlockReason maps to a TrustNarrative
// ============================================================================
describe('Mapping completeness', () => {
  it.each(ALL_REASONS)('maps %s to a valid TrustNarrative', (reason) => {
    const result = deriveTrustNarrative(reason);
    expect(result).not.toBeNull();
    expect(result!.reason).toBe(reason);
    expect(result!.titleKey).toBeTruthy();
    expect(result!.messageKey).toBeTruthy();
    expect(['WAITING', 'BLOCKED', 'INFO']).toContain(result!.kind);
  });
});

// ============================================================================
// T3 — Kind classification
// ============================================================================
describe('Kind classification', () => {
  it('IDENTITY_LOADING → WAITING', () => {
    expect(deriveTrustNarrative('IDENTITY_LOADING')?.kind).toBe('WAITING');
  });

  it('TENANT_BLOCKED → BLOCKED', () => {
    expect(deriveTrustNarrative('TENANT_BLOCKED')?.kind).toBe('BLOCKED');
  });

  it('BILLING_BLOCKED → BLOCKED', () => {
    expect(deriveTrustNarrative('BILLING_BLOCKED')?.kind).toBe('BLOCKED');
  });

  it('NO_PERMISSION → BLOCKED', () => {
    expect(deriveTrustNarrative('NO_PERMISSION')?.kind).toBe('BLOCKED');
  });

  it('FEATURE_DISABLED → INFO', () => {
    expect(deriveTrustNarrative('FEATURE_DISABLED')?.kind).toBe('INFO');
  });

  it('NO_DATA → INFO', () => {
    expect(deriveTrustNarrative('NO_DATA')?.kind).toBe('INFO');
  });
});

// ============================================================================
// T4 — i18n key structure
// ============================================================================
describe('i18n key structure', () => {
  it.each(ALL_REASONS)('%s has trust.narrative.* keys', (reason) => {
    const result = deriveTrustNarrative(reason)!;
    expect(result.titleKey).toMatch(/^trust\.narrative\./);
    expect(result.messageKey).toMatch(/^trust\.narrative\./);
  });
});

// ============================================================================
// T5 — Reason passthrough
// ============================================================================
describe('Reason passthrough', () => {
  it.each(ALL_REASONS)('%s reason is preserved', (reason) => {
    expect(deriveTrustNarrative(reason)!.reason).toBe(reason);
  });
});
