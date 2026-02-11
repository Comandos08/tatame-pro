/**
 * REPORTS SAFE GOLD — Normalizers v1.0 + REPORTS1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import type {
  SafeReportType,
  SafeReportScope,
  ReportViewState,
  SafeReportMode,
  SafeAnalyticsViewState,
} from '@/types/report-state';

import {
  SAFE_REPORT_TYPES,
  SAFE_REPORT_SCOPES,
  SAFE_REPORT_VIEW_STATES,
  SAFE_REPORT_MODES,
  PRODUCTION_TO_SAFE_REPORT_TYPE,
  PRODUCTION_TO_SAFE_REPORT_SCOPE,
} from '@/types/report-state';

/**
 * Assert report type belongs to SAFE GOLD subset.
 * Falls back to 'OVERVIEW' for unknown values.
 */
export function assertReportType(v: string | null | undefined): SafeReportType {
  const raw = (v ?? '').trim();
  if (!raw) return 'OVERVIEW';

  const upper = raw.toUpperCase();
  
  // Direct match in SAFE subset
  if (SAFE_REPORT_TYPES.includes(upper as SafeReportType)) {
    return upper as SafeReportType;
  }
  
  // Production mapping
  const mapped = PRODUCTION_TO_SAFE_REPORT_TYPE[upper];
  if (mapped) return mapped;

  return 'OVERVIEW';
}

/**
 * Assert report scope belongs to SAFE GOLD subset.
 * Falls back to 'TENANT' for unknown values.
 */
export function assertReportScope(v: string | null | undefined): SafeReportScope {
  const raw = (v ?? '').trim();
  if (!raw) return 'TENANT';

  const upper = raw.toUpperCase();
  
  // Direct match in SAFE subset
  if (SAFE_REPORT_SCOPES.includes(upper as SafeReportScope)) {
    return upper as SafeReportScope;
  }
  
  // Production mapping
  const mapped = PRODUCTION_TO_SAFE_REPORT_SCOPE[upper];
  if (mapped) return mapped;

  return 'TENANT';
}

/**
 * Assert report view state belongs to SAFE GOLD subset.
 * Falls back to 'ERROR' for unknown values.
 */
export function assertReportViewState(v: string | null | undefined): ReportViewState {
  const raw = (v ?? '').trim();
  if (!raw) return 'ERROR';

  const upper = raw.toUpperCase();
  
  if (SAFE_REPORT_VIEW_STATES.includes(upper as ReportViewState)) {
    return upper as ReportViewState;
  }

  return 'ERROR';
}

// ============================================
// REPORTS1.0 — ANALYTICS HARDENING NORMALIZERS
// ============================================

/**
 * Assert report mode belongs to SAFE GOLD subset.
 * Falls back to 'TENANT' for unknown values.
 */
export function assertReportMode(v: string | null | undefined): SafeReportMode {
  const raw = (v ?? '').trim();
  if (!raw) return 'TENANT';

  const upper = raw.toUpperCase();
  
  if (SAFE_REPORT_MODES.includes(upper as SafeReportMode)) {
    return upper as SafeReportMode;
  }

  return 'TENANT';
}

/**
 * Normalize analytics view state from raw data.
 * Pure function — NO side effects, NO Date, NO exceptions.
 * 
 * @param input - Raw data from API/state
 * @returns Deterministic SafeAnalyticsViewState
 */
export function normalizeAnalyticsViewState(input: unknown): SafeAnalyticsViewState {
  // Null/undefined → EMPTY (not error, just no data)
  if (input === null || input === undefined) return 'EMPTY';
  
  // Empty array → EMPTY
  if (Array.isArray(input) && input.length === 0) return 'EMPTY';
  
  // Non-empty array → OK
  if (Array.isArray(input) && input.length > 0) return 'OK';
  
  // Object (non-array, non-null) → check for error markers
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    
    // Explicit error indicators
    if (obj.error || obj.isError || obj.status === 'error') return 'ERROR';
    
    // Partial data indicators
    if (obj.partial || obj.incomplete || obj.degraded) return 'PARTIAL';
    
    // Has data property
    if ('data' in obj) {
      return normalizeAnalyticsViewState(obj.data);
    }
    
    // Non-empty object with keys → OK
    if (Object.keys(obj).length > 0) return 'OK';
    
    // Empty object → EMPTY
    return 'EMPTY';
  }
  
  // Primitive truthy values → OK
  if (input) return 'OK';
  
  // Fallback for edge cases (0, false, '') → EMPTY
  return 'EMPTY';
}

/**
 * Derive report mode from context (tenant or global).
 * Pure function for E2E instrumentation.
 */
export function deriveReportMode(
  tenantId: string | null | undefined,
  isGlobal: boolean = false
): SafeReportMode {
  if (isGlobal) return 'GLOBAL';
  if (tenantId) return 'TENANT';
  return 'TENANT';
}
