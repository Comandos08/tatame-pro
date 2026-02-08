/**
 * REPORTS SAFE GOLD — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import type {
  SafeReportType,
  SafeReportScope,
  ReportViewState,
} from '@/types/report-state';

import {
  SAFE_REPORT_TYPES,
  SAFE_REPORT_SCOPES,
  SAFE_REPORT_VIEW_STATES,
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
