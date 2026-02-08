/**
 * 🔐 AUDIT2.0 — Normalization & Hash (SAFE GOLD)
 * 
 * Pure functions for deterministic audit entry normalization.
 * Guarantees: same input → same output, always.
 * 
 * ❌ PROHIBITED:
 *   - Date.now()
 *   - new Date()
 *   - Math.random()
 *   - UUID generation
 *   - Side effects
 * 
 * FROZEN: Do not modify without constitutional review.
 */

import {
  AuditEntryInput,
  NormalizedAuditEntry,
  SafeAuditViewState,
  SAFE_AUDIT_VIEW_STATES,
} from '@/types/audit-state';

// ============================================================
// DETERMINISTIC NORMALIZATION
// ============================================================

/**
 * Normalize an audit entry for deterministic hashing.
 * Keys in metadata are sorted alphabetically.
 * 
 * @param input - Raw audit entry input
 * @returns Normalized entry with sorted metadata keys
 */
export function normalizeAuditEntry(input: AuditEntryInput): NormalizedAuditEntry {
  const sortedMetadata = sortObjectKeys(input.metadata);
  
  return {
    tenant_id: input.tenant_id,
    actor_id: input.actor_id,
    action: input.action,
    entity: input.entity,
    entity_id: input.entity_id ?? null,
    level: input.level,
    occurred_at: input.occurred_at,
    metadata: sortedMetadata,
  };
}

/**
 * Recursively sort object keys for deterministic serialization.
 */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => 
      typeof item === 'object' && item !== null 
        ? sortObjectKeys(item as Record<string, unknown>) 
        : item
    ) as unknown as Record<string, unknown>;
  }
  
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      const value = obj[key];
      acc[key] = typeof value === 'object' && value !== null
        ? sortObjectKeys(value as Record<string, unknown>)
        : value;
      return acc;
    }, {} as Record<string, unknown>);
}

// ============================================================
// DETERMINISTIC HASH (SHA-256)
// ============================================================

/**
 * Compute SHA-256 hash of a normalized audit entry.
 * Uses Web Crypto API for browser compatibility.
 * 
 * @param entry - Normalized audit entry
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function computeAuditHash(entry: NormalizedAuditEntry): Promise<string> {
  const jsonString = JSON.stringify(entry);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Synchronous hash computation for testing (uses simple hash).
 * For production, use computeAuditHash.
 */
export function computeAuditHashSync(entry: NormalizedAuditEntry): string {
  const jsonString = JSON.stringify(entry);
  let hash = 0;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============================================================
// VIEW STATE NORMALIZATION
// ============================================================

/**
 * Normalize raw API response to SAFE GOLD view state.
 * Pure function — no side effects.
 */
export function normalizeAuditViewState(input: unknown): SafeAuditViewState {
  if (input === null || input === undefined) {
    return 'EMPTY';
  }
  
  if (typeof input === 'string') {
    const upper = input.toUpperCase().trim();
    if (SAFE_AUDIT_VIEW_STATES.includes(upper as SafeAuditViewState)) {
      return upper as SafeAuditViewState;
    }
    if (upper === 'PENDING' || upper === 'FETCHING') {
      return 'LOADING';
    }
    return 'OK';
  }
  
  if (Array.isArray(input)) {
    return input.length === 0 ? 'EMPTY' : 'OK';
  }
  
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (obj.error || obj.status === 'error') {
      return 'ERROR';
    }
    if (obj.loading || obj.status === 'loading') {
      return 'LOADING';
    }
    return Object.keys(obj).length === 0 ? 'EMPTY' : 'OK';
  }
  
  return 'OK';
}

// ============================================================
// AGGREGATION HELPERS (PURE)
// ============================================================

/**
 * Count audit entries by action type.
 */
export function countByAction(
  entries: readonly { action: string }[]
): Record<string, number> {
  return entries.reduce((acc, entry) => {
    acc[entry.action] = (acc[entry.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Count audit entries by entity type.
 */
export function countByEntity(
  entries: readonly { entity: string }[]
): Record<string, number> {
  return entries.reduce((acc, entry) => {
    acc[entry.entity] = (acc[entry.entity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Count audit entries by level.
 */
export function countByLevel(
  entries: readonly { level: string }[]
): Record<string, number> {
  return entries.reduce((acc, entry) => {
    acc[entry.level] = (acc[entry.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
