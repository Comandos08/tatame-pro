import { describe, it, expect } from 'vitest';
import {
  normalizeAuditEntry,
  computeAuditHash,
  normalizeAuditViewState,
  countByAction,
  countByEntity,
  countByLevel,
} from './normalize';
import {
  SAFE_AUDIT_ACTIONS,
  SAFE_AUDIT_ENTITIES,
  SAFE_AUDIT_LEVELS,
  SAFE_AUDIT_VIEW_STATES,
  isValidAuditAction,
  isValidAuditEntity,
  isValidAuditLevel,
  isValidAuditViewState,
  type AuditEntryInput,
} from '@/types/audit-state';

// ============================================================
// Fixtures
// ============================================================

const FIXED_TIMESTAMP = '2026-05-14T00:00:00.000Z';

function makeInput(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    tenant_id: 'tenant-1',
    actor_id: 'actor-1',
    action: 'CREATE',
    entity: 'MEMBERSHIP',
    entity_id: 'membership-1',
    level: 'INFO',
    occurred_at: FIXED_TIMESTAMP,
    metadata: {},
    ...overrides,
  };
}

// ============================================================
// normalizeAuditEntry — deterministic key sort
// ============================================================

describe('normalizeAuditEntry', () => {
  it('preserves every input field unchanged', () => {
    const input = makeInput({
      metadata: { foo: 'bar' },
      entity_id: 'eid',
    });
    const normalized = normalizeAuditEntry(input);
    expect(normalized.tenant_id).toBe(input.tenant_id);
    expect(normalized.actor_id).toBe(input.actor_id);
    expect(normalized.action).toBe(input.action);
    expect(normalized.entity).toBe(input.entity);
    expect(normalized.entity_id).toBe(input.entity_id);
    expect(normalized.level).toBe(input.level);
    expect(normalized.occurred_at).toBe(input.occurred_at);
  });

  it('defaults entity_id to null when omitted', () => {
    const input: AuditEntryInput = {
      tenant_id: 'tenant-1',
      actor_id: 'actor-1',
      action: 'CREATE',
      entity: 'MEMBERSHIP',
      level: 'INFO',
      occurred_at: FIXED_TIMESTAMP,
      metadata: {},
    };
    expect(normalizeAuditEntry(input).entity_id).toBeNull();
  });

  it('preserves null entity_id', () => {
    const normalized = normalizeAuditEntry(makeInput({ entity_id: null }));
    expect(normalized.entity_id).toBeNull();
  });

  it('sorts metadata keys alphabetically at the top level', () => {
    const normalized = normalizeAuditEntry(
      makeInput({ metadata: { zebra: 1, apple: 2, mango: 3 } }),
    );
    expect(Object.keys(normalized.metadata)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('recursively sorts nested object keys', () => {
    const normalized = normalizeAuditEntry(
      makeInput({
        metadata: {
          outer_b: { inner_z: 1, inner_a: 2 },
          outer_a: { y: 'last', x: 'first' },
        },
      }),
    );
    expect(Object.keys(normalized.metadata)).toEqual(['outer_a', 'outer_b']);
    const outerB = normalized.metadata.outer_b as Record<string, unknown>;
    expect(Object.keys(outerB)).toEqual(['inner_a', 'inner_z']);
    const outerA = normalized.metadata.outer_a as Record<string, unknown>;
    expect(Object.keys(outerA)).toEqual(['x', 'y']);
  });

  it('sorts object keys inside array elements but preserves array order', () => {
    const normalized = normalizeAuditEntry(
      makeInput({
        metadata: {
          items: [
            { z: 1, a: 2 },
            { y: 3, b: 4 },
          ],
        },
      }),
    );
    const items = normalized.metadata.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(Object.keys(items[0])).toEqual(['a', 'z']);
    expect(Object.keys(items[1])).toEqual(['b', 'y']);
    // Array order itself preserved
    expect(items[0].a).toBe(2);
    expect(items[1].b).toBe(4);
  });

  it('leaves primitive values inside metadata untouched', () => {
    const normalized = normalizeAuditEntry(
      makeInput({
        metadata: { n: 42, s: 'hello', b: true, x: null },
      }),
    );
    expect(normalized.metadata.n).toBe(42);
    expect(normalized.metadata.s).toBe('hello');
    expect(normalized.metadata.b).toBe(true);
    expect(normalized.metadata.x).toBeNull();
  });
});

// ============================================================
// computeAuditHash — deterministic SHA-256
// ============================================================

describe('computeAuditHash', () => {
  it('produces a 64-character lowercase hex string', async () => {
    const hash = await computeAuditHash(normalizeAuditEntry(makeInput()));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input yields the same hash', async () => {
    const entry = normalizeAuditEntry(makeInput({ metadata: { x: 1 } }));
    const h1 = await computeAuditHash(entry);
    const h2 = await computeAuditHash(entry);
    expect(h1).toBe(h2);
  });

  it('is idempotent across input key reorderings (normalize then hash)', async () => {
    const a = normalizeAuditEntry(makeInput({ metadata: { a: 1, b: 2, c: 3 } }));
    const b = normalizeAuditEntry(makeInput({ metadata: { c: 3, a: 1, b: 2 } }));
    expect(await computeAuditHash(a)).toBe(await computeAuditHash(b));
  });

  it('is idempotent across nested key reorderings', async () => {
    const a = normalizeAuditEntry(
      makeInput({ metadata: { outer: { y: 2, x: 1 } } }),
    );
    const b = normalizeAuditEntry(
      makeInput({ metadata: { outer: { x: 1, y: 2 } } }),
    );
    expect(await computeAuditHash(a)).toBe(await computeAuditHash(b));
  });

  it('changes when any field changes', async () => {
    const base = await computeAuditHash(normalizeAuditEntry(makeInput()));
    const diffActor = await computeAuditHash(
      normalizeAuditEntry(makeInput({ actor_id: 'actor-2' })),
    );
    const diffAction = await computeAuditHash(
      normalizeAuditEntry(makeInput({ action: 'DELETE' })),
    );
    const diffMeta = await computeAuditHash(
      normalizeAuditEntry(makeInput({ metadata: { x: 1 } })),
    );
    expect(diffActor).not.toBe(base);
    expect(diffAction).not.toBe(base);
    expect(diffMeta).not.toBe(base);
  });

  it('changes when metadata value differs even at same key', async () => {
    const a = await computeAuditHash(
      normalizeAuditEntry(makeInput({ metadata: { count: 1 } })),
    );
    const b = await computeAuditHash(
      normalizeAuditEntry(makeInput({ metadata: { count: 2 } })),
    );
    expect(a).not.toBe(b);
  });
});

// ============================================================
// normalizeAuditViewState — input coercion
// ============================================================

describe('normalizeAuditViewState', () => {
  it('returns EMPTY for null', () => {
    expect(normalizeAuditViewState(null)).toBe('EMPTY');
  });

  it('returns EMPTY for undefined', () => {
    expect(normalizeAuditViewState(undefined)).toBe('EMPTY');
  });

  it('returns EMPTY for empty array', () => {
    expect(normalizeAuditViewState([])).toBe('EMPTY');
  });

  it('returns OK for non-empty array', () => {
    expect(normalizeAuditViewState([1])).toBe('OK');
  });

  it('returns EMPTY for empty object', () => {
    expect(normalizeAuditViewState({})).toBe('EMPTY');
  });

  it('returns OK for object with arbitrary keys', () => {
    expect(normalizeAuditViewState({ some: 'data' })).toBe('OK');
  });

  it('returns ERROR when object has an error property', () => {
    expect(normalizeAuditViewState({ error: 'boom' })).toBe('ERROR');
  });

  it('returns ERROR when object.status is "error"', () => {
    expect(normalizeAuditViewState({ status: 'error' })).toBe('ERROR');
  });

  it('returns LOADING when object.loading is truthy', () => {
    expect(normalizeAuditViewState({ loading: true })).toBe('LOADING');
  });

  it('returns LOADING when object.status is "loading"', () => {
    expect(normalizeAuditViewState({ status: 'loading' })).toBe('LOADING');
  });

  it.each(SAFE_AUDIT_VIEW_STATES)(
    'returns %s for direct uppercase string match',
    (state) => {
      expect(normalizeAuditViewState(state)).toBe(state);
    },
  );

  it('returns LOADING for "PENDING" alias', () => {
    expect(normalizeAuditViewState('PENDING')).toBe('LOADING');
  });

  it('returns LOADING for "FETCHING" alias', () => {
    expect(normalizeAuditViewState('FETCHING')).toBe('LOADING');
  });

  it('returns OK for an arbitrary unrecognized string', () => {
    expect(normalizeAuditViewState('something-else')).toBe('OK');
  });

  it('is case-insensitive for direct matches', () => {
    expect(normalizeAuditViewState('loading')).toBe('LOADING');
    expect(normalizeAuditViewState('  Error  ')).toBe('ERROR');
  });

  it('returns OK for primitives that are not strings, arrays, or objects', () => {
    expect(normalizeAuditViewState(42)).toBe('OK');
    expect(normalizeAuditViewState(true)).toBe('OK');
  });
});

// ============================================================
// Aggregation helpers
// ============================================================

describe('countByAction', () => {
  it('returns an empty object for an empty list', () => {
    expect(countByAction([])).toEqual({});
  });

  it('counts occurrences of each action', () => {
    expect(
      countByAction([
        { action: 'CREATE' },
        { action: 'CREATE' },
        { action: 'UPDATE' },
        { action: 'DELETE' },
        { action: 'CREATE' },
      ]),
    ).toEqual({ CREATE: 3, UPDATE: 1, DELETE: 1 });
  });

  it('is order-independent', () => {
    const a = countByAction([
      { action: 'CREATE' },
      { action: 'UPDATE' },
      { action: 'CREATE' },
    ]);
    const b = countByAction([
      { action: 'UPDATE' },
      { action: 'CREATE' },
      { action: 'CREATE' },
    ]);
    expect(a).toEqual(b);
  });
});

describe('countByEntity', () => {
  it('counts occurrences of each entity', () => {
    expect(
      countByEntity([
        { entity: 'MEMBERSHIP' },
        { entity: 'TENANT' },
        { entity: 'MEMBERSHIP' },
      ]),
    ).toEqual({ MEMBERSHIP: 2, TENANT: 1 });
  });

  it('returns an empty object for an empty list', () => {
    expect(countByEntity([])).toEqual({});
  });
});

describe('countByLevel', () => {
  it('counts occurrences of each level', () => {
    expect(
      countByLevel([
        { level: 'INFO' },
        { level: 'CRITICAL' },
        { level: 'INFO' },
        { level: 'WARNING' },
      ]),
    ).toEqual({ INFO: 2, CRITICAL: 1, WARNING: 1 });
  });

  it('returns an empty object for an empty list', () => {
    expect(countByLevel([])).toEqual({});
  });
});

// ============================================================
// Type guards
// ============================================================

describe('isValidAuditAction', () => {
  it.each(SAFE_AUDIT_ACTIONS)('accepts %s', (action) => {
    expect(isValidAuditAction(action)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isValidAuditAction('NOPE')).toBe(false);
    expect(isValidAuditAction('')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidAuditAction(null)).toBe(false);
    expect(isValidAuditAction(undefined)).toBe(false);
    expect(isValidAuditAction(123)).toBe(false);
    expect(isValidAuditAction({})).toBe(false);
  });

  it('is case-sensitive (the SAFE GOLD enum is uppercase only)', () => {
    expect(isValidAuditAction('create')).toBe(false);
  });
});

describe('isValidAuditEntity', () => {
  it.each(SAFE_AUDIT_ENTITIES)('accepts %s', (entity) => {
    expect(isValidAuditEntity(entity)).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isValidAuditEntity('OTHER')).toBe(false);
    expect(isValidAuditEntity(null)).toBe(false);
  });
});

describe('isValidAuditLevel', () => {
  it.each(SAFE_AUDIT_LEVELS)('accepts %s', (level) => {
    expect(isValidAuditLevel(level)).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isValidAuditLevel('FATAL')).toBe(false);
    expect(isValidAuditLevel(0)).toBe(false);
  });
});

describe('isValidAuditViewState', () => {
  it.each(SAFE_AUDIT_VIEW_STATES)('accepts %s', (state) => {
    expect(isValidAuditViewState(state)).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isValidAuditViewState('PENDING')).toBe(false);
    expect(isValidAuditViewState(false)).toBe(false);
  });
});
