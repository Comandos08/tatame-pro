/**
 * 🔐 AUDIT2.0 — Read API (SAFE GOLD)
 * 
 * READ-ONLY access to audit logs.
 * No mutations, no side effects.
 * 
 * ❌ PROHIBITED:
 *   - INSERT / UPDATE / DELETE
 *   - Side effects
 *   - Cache mutations
 * 
 * ✅ GUARANTEED:
 *   - Pure read operations
 *   - Deterministic ordering
 *   - Stable pagination
 * 
 * FROZEN: Do not modify without constitutional review.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SafeAuditViewState } from '@/types/audit-state';
import { normalizeAuditViewState } from './normalize';

// ============================================================
// READ TYPES
// ============================================================

export interface AuditLogQueryParams {
  tenant_id: string;
  limit?: number;
  offset?: number;
  action?: string;
  entity?: string;
  level?: string;
  from_date?: string;
  to_date?: string;
}

export interface AuditLogReadResult {
  data: AuditLogRow[];
  viewState: SafeAuditViewState;
  total: number;
  error?: string;
}

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  profile_id: string | null;
  event_type: string;
  category: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// READ OPERATIONS — PURE
// ============================================================

/**
 * Fetch audit logs for a tenant.
 * Pure read operation — no side effects.
 */
export async function fetchAuditLogs(
  params: AuditLogQueryParams
): Promise<AuditLogReadResult> {
  try {
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('tenant_id', params.tenant_id)
      .order('created_at', { ascending: false });
    
    // Apply optional filters
    if (params.action) {
      query = query.ilike('event_type', `${params.action}_%`);
    }
    
    if (params.level) {
      query = query.contains('metadata', { level: params.level });
    }
    
    if (params.from_date) {
      query = query.gte('created_at', params.from_date);
    }
    
    if (params.to_date) {
      query = query.lte('created_at', params.to_date);
    }
    
    // Apply pagination
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      return {
        data: [],
        viewState: 'ERROR',
        total: 0,
        error: error.message,
      };
    }
    
    const rows = (data ?? []) as AuditLogRow[];
    
    return {
      data: rows,
      viewState: normalizeAuditViewState(rows),
      total: count ?? rows.length,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      data: [],
      viewState: 'ERROR',
      total: 0,
      error: errorMessage,
    };
  }
}

/**
 * Fetch a single audit log by ID.
 */
export async function fetchAuditLogById(
  id: string
): Promise<AuditLogRow | null> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return data as AuditLogRow;
  } catch {
    return null;
  }
}

/**
 * Fetch audit logs for a specific entity.
 */
export async function fetchAuditLogsForEntity(
  tenant_id: string,
  entity_id: string,
  limit: number = 20
): Promise<AuditLogReadResult> {
  try {
    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenant_id)
      .contains('metadata', { entity_id })
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      return {
        data: [],
        viewState: 'ERROR',
        total: 0,
        error: error.message,
      };
    }
    
    const rows = (data ?? []) as AuditLogRow[];
    
    return {
      data: rows,
      viewState: normalizeAuditViewState(rows),
      total: count ?? rows.length,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      data: [],
      viewState: 'ERROR',
      total: 0,
      error: errorMessage,
    };
  }
}

// ============================================================
// AGGREGATION QUERIES — PURE
// ============================================================

/**
 * Get audit log counts grouped by action.
 */
export async function getAuditCountsByAction(
  tenant_id: string
): Promise<Record<string, number>> {
  const { data } = await fetchAuditLogs({ tenant_id, limit: 1000 });
  
  return data.reduce((acc, log) => {
    const action = log.event_type.split('_')[0] || 'UNKNOWN';
    acc[action] = (acc[action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Get audit log counts grouped by category.
 */
export async function getAuditCountsByCategory(
  tenant_id: string
): Promise<Record<string, number>> {
  const { data } = await fetchAuditLogs({ tenant_id, limit: 1000 });
  
  return data.reduce((acc, log) => {
    const category = log.category || 'OTHER';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
