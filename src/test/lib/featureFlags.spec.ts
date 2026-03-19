/**
 * PI U15 — INSTITUTIONAL FEATURE FLAGS — Unit Tests
 *
 * Validates the canonical feature flag resolution model:
 * - buildDefaultFlagMap: all flags default to false
 * - resolveFlags: global → tenant override precedence
 * - isValidFlag: rejects unknown flags
 */

import { describe, it, expect } from 'vitest';
import {
  buildDefaultFlagMap,
  resolveFlags,
  INSTITUTIONAL_FLAGS,
  type InstitutionalFeatureFlag,
} from '@/lib/featureFlags/featureFlags';

// ─── buildDefaultFlagMap ──────────────────────────────────────────────────────

describe('buildDefaultFlagMap', () => {
  it('returns an object with all known flags', () => {
    const map = buildDefaultFlagMap();
    for (const flag of INSTITUTIONAL_FLAGS) {
      expect(map).toHaveProperty(flag);
    }
  });

  it('defaults every flag to false', () => {
    const map = buildDefaultFlagMap();
    for (const flag of INSTITUTIONAL_FLAGS) {
      expect(map[flag]).toBe(false);
    }
  });

  it('contains exactly the same flags as INSTITUTIONAL_FLAGS', () => {
    const map = buildDefaultFlagMap();
    expect(Object.keys(map).sort()).toEqual([...INSTITUTIONAL_FLAGS].sort());
  });

  it('returns a fresh object each call (not shared reference)', () => {
    const map1 = buildDefaultFlagMap();
    const map2 = buildDefaultFlagMap();
    map1['EVENTS_V2'] = true;
    expect(map2['EVENTS_V2']).toBe(false);
  });
});

// ─── resolveFlags ─────────────────────────────────────────────────────────────

describe('resolveFlags', () => {
  const TENANT_A = 'tenant-a-id';
  const TENANT_B = 'tenant-b-id';

  it('returns all-false map with empty records', () => {
    const map = resolveFlags([], TENANT_A);
    for (const flag of INSTITUTIONAL_FLAGS) {
      expect(map[flag]).toBe(false);
    }
  });

  it('applies global flag (tenant_id: null)', () => {
    const records = [{ flag: 'EVENTS_V2', enabled: true, tenant_id: null }];
    const map = resolveFlags(records, TENANT_A);
    expect(map['EVENTS_V2']).toBe(true);
  });

  it('global disabled flag overrides default false', () => {
    // A global record explicitly disabling a flag keeps it false
    const records = [{ flag: 'EVENTS_V2', enabled: false, tenant_id: null }];
    const map = resolveFlags(records, TENANT_A);
    expect(map['EVENTS_V2']).toBe(false);
  });

  it('tenant-specific flag overrides global', () => {
    const records = [
      { flag: 'EVENTS_V2', enabled: true, tenant_id: null },  // global: ON
      { flag: 'EVENTS_V2', enabled: false, tenant_id: TENANT_A }, // tenant override: OFF
    ];
    const map = resolveFlags(records, TENANT_A);
    expect(map['EVENTS_V2']).toBe(false);
  });

  it('tenant-specific ON overrides global OFF', () => {
    const records = [
      { flag: 'DIGITAL_DIPLOMA_PDF', enabled: false, tenant_id: null },
      { flag: 'DIGITAL_DIPLOMA_PDF', enabled: true, tenant_id: TENANT_A },
    ];
    const map = resolveFlags(records, TENANT_A);
    expect(map['DIGITAL_DIPLOMA_PDF']).toBe(true);
  });

  it('tenant override does NOT affect another tenant', () => {
    const records = [
      { flag: 'EVENTS_V2', enabled: true, tenant_id: TENANT_A },
    ];
    const mapA = resolveFlags(records, TENANT_A);
    const mapB = resolveFlags(records, TENANT_B);
    expect(mapA['EVENTS_V2']).toBe(true);
    expect(mapB['EVENTS_V2']).toBe(false); // B not affected by A's override
  });

  it('ignores records with unknown flag names', () => {
    const records = [
      { flag: 'UNKNOWN_FLAG', enabled: true, tenant_id: null },
      { flag: 'EVENTS_V2', enabled: true, tenant_id: null },
    ];
    const map = resolveFlags(records, TENANT_A);
    expect(map['EVENTS_V2']).toBe(true);
    // Unknown flag should not be in map
    expect((map as Record<string, unknown>)['UNKNOWN_FLAG']).toBeUndefined();
  });

  it('without tenantId, tenant-specific flags are not applied', () => {
    const records = [
      { flag: 'EVENTS_V2', enabled: true, tenant_id: TENANT_A },
    ];
    const map = resolveFlags(records, undefined);
    // No global record, no tenantId → stays false
    expect(map['EVENTS_V2']).toBe(false);
  });

  it('global ON + no tenant override → flag stays ON for any tenant', () => {
    const records = [{ flag: 'ACADEMY_PUBLIC_PAGE', enabled: true, tenant_id: null }];
    const mapA = resolveFlags(records, TENANT_A);
    const mapB = resolveFlags(records, TENANT_B);
    expect(mapA['ACADEMY_PUBLIC_PAGE']).toBe(true);
    expect(mapB['ACADEMY_PUBLIC_PAGE']).toBe(true);
  });

  it('multiple flags resolved independently', () => {
    const records = [
      { flag: 'EVENTS_V2', enabled: true, tenant_id: null },
      { flag: 'ADVANCED_REPORTS', enabled: false, tenant_id: null },
      { flag: 'DIGITAL_DIPLOMA_PDF', enabled: true, tenant_id: TENANT_A },
    ];
    const map = resolveFlags(records, TENANT_A);
    expect(map['EVENTS_V2']).toBe(true);
    expect(map['ADVANCED_REPORTS']).toBe(false);
    expect(map['DIGITAL_DIPLOMA_PDF']).toBe(true);
    expect(map['EXPERIMENTAL_UI']).toBe(false); // not in records
  });
});

// ─── INSTITUTIONAL_FLAGS integrity ────────────────────────────────────────────

describe('INSTITUTIONAL_FLAGS', () => {
  it('is a non-empty readonly array', () => {
    expect(INSTITUTIONAL_FLAGS.length).toBeGreaterThan(0);
  });

  it('contains no duplicates', () => {
    const set = new Set(INSTITUTIONAL_FLAGS);
    expect(set.size).toBe(INSTITUTIONAL_FLAGS.length);
  });

  it('all entries are non-empty strings', () => {
    for (const flag of INSTITUTIONAL_FLAGS) {
      expect(typeof flag).toBe('string');
      expect(flag.length).toBeGreaterThan(0);
    }
  });

  it('all entries are SCREAMING_SNAKE_CASE', () => {
    for (const flag of INSTITUTIONAL_FLAGS) {
      expect(flag).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});
