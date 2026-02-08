/**
 * 🔐 AUDIT2.0 — Write Boundary (SAFE GOLD)
 * 
 * SINGLE POINT OF ENTRY for all audit log writes.
 * No other module may write directly to audit_logs.
 * 
 * ❌ PROHIBITED:
 *   - Date.now() / new Date() — occurred_at MUST be provided
 *   - UPDATE operations
 *   - DELETE operations
 *   - Writes outside this boundary
 * 
 * ✅ GUARANTEED:
 *   - Append-only semantics
 *   - Deterministic hashing
 *   - Normalized metadata
 *   - Idempotent (same input → same hash)
 * 
 * FROZEN: Do not modify without constitutional review.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  AuditEntryInput,
  SafeAuditAction,
  SafeAuditEntity,
  SafeAuditLevel,
  isValidAuditAction,
  isValidAuditEntity,
  isValidAuditLevel,
} from '@/types/audit-state';
import { normalizeAuditEntry, computeAuditHash } from './normalize';

// ============================================================
// WRITE BOUNDARY — SINGLE ENTRY POINT
// ============================================================

export interface WriteAuditResult {
  success: boolean;
  id?: string;
  hash?: string;
  error?: string;
  /** True if this entry was already written (idempotent short-circuit) */
  duplicate?: boolean;
}

/**
 * Write a single audit log entry.
 * This is the ONLY authorized method to create audit records.
 * 
 * @param entry - Audit entry with all required fields
 * @returns Result with success status and optional error
 */
export async function writeAuditLog(entry: AuditEntryInput): Promise<WriteAuditResult> {
  try {
    // Validate enums
    if (!isValidAuditAction(entry.action)) {
      return { success: false, error: `Invalid action: ${entry.action}` };
    }
    if (!isValidAuditEntity(entry.entity)) {
      return { success: false, error: `Invalid entity: ${entry.entity}` };
    }
    if (!isValidAuditLevel(entry.level)) {
      return { success: false, error: `Invalid level: ${entry.level}` };
    }
    
    // Validate occurred_at is provided (no dynamic time!)
    if (!entry.occurred_at || typeof entry.occurred_at !== 'string') {
      return { success: false, error: 'occurred_at is required and must be ISO 8601 string' };
    }
    
    // Normalize entry
    const normalized = normalizeAuditEntry(entry);
    
    // Compute deterministic hash
    const hash = await computeAuditHash(normalized);
    
    // ============================================================
    // IDEMPOTENCY CHECK — SAFE GOLD PLUS
    // ============================================================
    // Check if an entry with the same hash already exists.
    // If so, short-circuit and return success without inserting.
    // This guarantees: same input → same result, no duplicates.
    // ❌ NO UPDATE, ❌ NO DELETE — append-only semantics preserved.
    
    const { data: existing } = await supabase
      .from('audit_logs')
      .select('id')
      .eq('tenant_id', normalized.tenant_id)
      .eq('metadata->>hash', hash)
      .limit(1)
      .maybeSingle();
    
    if (existing) {
      // Idempotent short-circuit — entry already exists
      return {
        success: true,
        id: existing.id,
        hash,
        duplicate: true,
      };
    }
    
    // Map to existing audit_logs schema
    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        tenant_id: normalized.tenant_id,
        profile_id: normalized.actor_id,
        event_type: `${normalized.action}_${normalized.entity}`,
        category: mapEntityToCategory(normalized.entity),
        metadata: {
          ...normalized.metadata,
          entity_id: normalized.entity_id,
          level: normalized.level,
          occurred_at: normalized.occurred_at,
          hash,
          safe_gold_version: '2.0.1',
        },
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[AUDIT-WRITE] Insert failed:', error.message);
      return { success: false, error: error.message };
    }
    
    return {
      success: true,
      id: data?.id,
      hash,
      duplicate: false,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[AUDIT-WRITE] Exception:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================
// BATCH WRITE (FOR BULK OPERATIONS)
// ============================================================

export interface BatchWriteResult {
  success: boolean;
  written: number;
  failed: number;
  errors: string[];
}

/**
 * Write multiple audit entries in batch.
 * Each entry is processed independently — partial success is possible.
 */
export async function writeAuditLogBatch(
  entries: AuditEntryInput[]
): Promise<BatchWriteResult> {
  const results = await Promise.all(
    entries.map(entry => writeAuditLog(entry))
  );
  
  const written = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const errors = results
    .filter(r => !r.success && r.error)
    .map(r => r.error!);
  
  return {
    success: failed === 0,
    written,
    failed,
    errors,
  };
}

// ============================================================
// HELPER: Map entity to category
// ============================================================

function mapEntityToCategory(entity: SafeAuditEntity): string {
  switch (entity) {
    case 'MEMBERSHIP':
      return 'MEMBERSHIP';
    case 'BILLING':
      return 'BILLING';
    case 'EVENT':
      return 'JOB';
    case 'DIPLOMA':
    case 'GRADING':
      return 'GRADING';
    case 'USER':
    case 'ROLE':
      return 'AUTH';
    case 'SYSTEM':
      return 'SECURITY';
    default:
      return 'OTHER';
  }
}

// ============================================================
// FACTORY HELPERS — Common Audit Patterns
// ============================================================

/**
 * Create a standard audit entry with required fields.
 * occurred_at MUST still be provided by caller!
 */
export function createAuditEntry(params: {
  tenant_id: string;
  actor_id: string;
  action: SafeAuditAction;
  entity: SafeAuditEntity;
  entity_id?: string;
  level?: SafeAuditLevel;
  occurred_at: string;
  metadata?: Record<string, unknown>;
}): AuditEntryInput {
  return {
    tenant_id: params.tenant_id,
    actor_id: params.actor_id,
    action: params.action,
    entity: params.entity,
    entity_id: params.entity_id ?? null,
    level: params.level ?? 'INFO',
    occurred_at: params.occurred_at,
    metadata: params.metadata ?? {},
  };
}
