/**
 * REPORTS SAFE GOLD — Read API v1.0
 *
 * Read-only operations for reports data.
 * No writes, no side effects, no mutations.
 */

import { supabase } from '@/integrations/supabase/client';
import { normalizeReportsViewState, assertReportType } from './normalizeReports';
import type { SafeReportType, SafeReportViewState } from '@/types/reports-state';

// ============================================
// TYPES
// ============================================

export interface ReportsQueryParams {
  tenant_id: string;
  type?: string; // raw type, will be normalized
  limit?: number;
}

export interface ReportsReadResult<T> {
  type: SafeReportType;
  viewState: SafeReportViewState;
  data: T;
  error?: string;
}

// ============================================
// READ OPERATIONS (SAFE GOLD: READ-ONLY)
// ============================================

/**
 * Fetch report data for a tenant.
 * SAFE GOLD: Read-only, no side effects, no writes.
 *
 * Strategy: Uses audit_logs as canonical read model fallback.
 * This is intentionally minimal — we're hardening the contract first.
 */
export async function fetchReport(
  params: ReportsQueryParams
): Promise<ReportsReadResult<unknown[]>> {
  const type = assertReportType(params.type);
  const limit = params.limit ?? 50;

  try {
    // SAFE GOLD: read-only sources only
    // No writes, no RPC, no side effects
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', params.tenant_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        type,
        viewState: 'ERROR',
        data: [],
        error: error.message,
      };
    }

    const rows = data ?? [];
    return {
      type,
      viewState: normalizeReportsViewState(rows),
      data: rows,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      type,
      viewState: 'ERROR',
      data: [],
      error: msg,
    };
  }
}

/**
 * Fetch membership health report.
 * SAFE GOLD: Read-only aggregation.
 */
export async function fetchMembershipsHealthReport(
  tenantId: string
): Promise<ReportsReadResult<{ active: number; expired: number; pending: number }>> {
  try {
    const { data, error } = await supabase
      .from('memberships')
      .select('status')
      .eq('tenant_id', tenantId);

    if (error) {
      return {
        type: 'MEMBERSHIPS_HEALTH',
        viewState: 'ERROR',
        data: { active: 0, expired: 0, pending: 0 },
        error: error.message,
      };
    }

    const rows = data ?? [];
    const active = rows.filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED').length;
    const expired = rows.filter((r) => r.status === 'EXPIRED' || r.status === 'CANCELLED').length;
    const pending = rows.filter((r) => r.status === 'PENDING_REVIEW' || r.status === 'PENDING_PAYMENT').length;

    return {
      type: 'MEMBERSHIPS_HEALTH',
      viewState: normalizeReportsViewState(rows),
      data: { active, expired, pending },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      type: 'MEMBERSHIPS_HEALTH',
      viewState: 'ERROR',
      data: { active: 0, expired: 0, pending: 0 },
      error: msg,
    };
  }
}

/**
 * Fetch events summary report.
 * SAFE GOLD: Read-only aggregation.
 */
export async function fetchEventsSummaryReport(
  tenantId: string
): Promise<ReportsReadResult<{ total: number; active: number; completed: number }>> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('status')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (error) {
      return {
        type: 'EVENTS_SUMMARY',
        viewState: 'ERROR',
        data: { total: 0, active: 0, completed: 0 },
        error: error.message,
      };
    }

    const rows = data ?? [];
    const total = rows.length;
    const active = rows.filter((r) => r.status === 'REGISTRATION_OPEN' || r.status === 'ONGOING').length;
    const completed = rows.filter((r) => r.status === 'FINISHED' || r.status === 'ARCHIVED').length;

    return {
      type: 'EVENTS_SUMMARY',
      viewState: normalizeReportsViewState(rows),
      data: { total, active, completed },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      type: 'EVENTS_SUMMARY',
      viewState: 'ERROR',
      data: { total: 0, active: 0, completed: 0 },
      error: msg,
    };
  }
}
