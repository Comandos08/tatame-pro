/**
 * PI U19 — MANIFESTO_MODE — Deterministic Tests (U8-compliant)
 *
 * Validates derivation, fail-silent behavior, and structural correctness.
 * Pure function tests — no React, no mocks.
 */

import { describe, it, expect } from 'vitest';
import { deriveManifestoMode } from '@/lib/ux/manifestoMode';
import type { BlockReason } from '@/lib/ux/blockReason';

const ALL_REASONS: BlockReason[] = [
  'IDENTITY_LOADING',
  'TENANT_BLOCKED',
  'BILLING_BLOCKED',
  'NO_PERMISSION',
  'FEATURE_DISABLED',
  'NO_DATA',
];

// ============================================================================
// T1 — Happy path → manifesto present
// ============================================================================
describe('Happy path', () => {
  it('returns manifesto when system is healthy', () => {
    const result = deriveManifestoMode(null, false, false);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('INSTITUTIONAL');
    expect(result!.titleKey).toBe('manifesto.title');
    expect(result!.messageKey).toBe('manifesto.message');
  });
});

// ============================================================================
// T2 — Loading → null
// ============================================================================
describe('Loading', () => {
  it('returns null when loading', () => {
    expect(deriveManifestoMode(null, true, false)).toBeNull();
  });

  it('returns null when loading even without block reason', () => {
    expect(deriveManifestoMode(null, true, true)).toBeNull();
  });
});

// ============================================================================
// T3 — Error → null
// ============================================================================
describe('Error', () => {
  it('returns null when error', () => {
    expect(deriveManifestoMode(null, false, true)).toBeNull();
  });
});

// ============================================================================
// T4 — Any BlockReason → null
// ============================================================================
describe('BlockReason suppresses manifesto', () => {
  it.each(ALL_REASONS)('%s → null', (reason) => {
    expect(deriveManifestoMode(reason, false, false)).toBeNull();
  });
});

// ============================================================================
// T5 — Structural integrity
// ============================================================================
describe('Structural integrity', () => {
  it('never returns partial manifesto', () => {
    const result = deriveManifestoMode(null, false, false);
    expect(result).toHaveProperty('kind');
    expect(result).toHaveProperty('titleKey');
    expect(result).toHaveProperty('messageKey');
  });

  it('kind is always INSTITUTIONAL', () => {
    const result = deriveManifestoMode(null, false, false);
    expect(result!.kind).toBe('INSTITUTIONAL');
  });
});
