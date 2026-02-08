/**
 * REPORTS SAFE GOLD — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import {
  SAFE_REPORT_TYPES,
  SAFE_REPORT_VIEW_STATES,
  PRODUCTION_TO_SAFE_REPORT_TYPE,
  DEFAULT_REPORT_TYPE,
  type SafeReportType,
  type SafeReportViewState,
} from '@/types/reports-state';

/**
 * Normalize reports view state from raw data.
 * Pure function — NO side effects, NO Date, NO exceptions.
 *
 * @param input - Raw data from API/state
 * @returns Deterministic SafeReportViewState
 */
export function normalizeReportsViewState(input: unknown): SafeReportViewState {
  // Null/undefined → EMPTY (not error, just no data)
  if (input === null || input === undefined) return 'EMPTY';

  // String input → check if valid view state
  if (typeof input === 'string') {
    const upper = input.toUpperCase().trim();
    if (SAFE_REPORT_VIEW_STATES.includes(upper as SafeReportViewState)) {
      return upper as SafeReportViewState;
    }
    // Map common aliases
    if (upper === 'PENDING' || upper === 'FETCHING') return 'LOADING';
    if (upper === 'READY' || upper === 'SUCCESS') return 'OK';
    if (upper === 'FAILED' || upper === 'FAILURE') return 'ERROR';
    return 'OK';
  }

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

    // Has data property → recurse
    if ('data' in obj) {
      return normalizeReportsViewState(obj.data);
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
 * Assert report type belongs to SAFE GOLD subset.
 * Falls back to 'TENANT_OVERVIEW' for unknown values.
 */
export function assertReportType(v: string | null | undefined): SafeReportType {
  const raw = (v ?? '').trim();
  if (!raw) return DEFAULT_REPORT_TYPE;

  const upper = raw.toUpperCase();

  // Direct match in SAFE subset
  if (SAFE_REPORT_TYPES.includes(upper as SafeReportType)) {
    return upper as SafeReportType;
  }

  // Production mapping
  const mapped = PRODUCTION_TO_SAFE_REPORT_TYPE[upper];
  if (mapped) return mapped;

  return DEFAULT_REPORT_TYPE;
}

/**
 * Check if a pathname is a reports route.
 * Pure function — route-based detection only.
 */
export function isReportsRoute(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes('/reports') ||
    lower.includes('/report') ||
    lower.includes('/insights') ||
    lower.includes('/summary')
  );
}

/**
 * Derive active report type from pathname.
 * Pure function — route-based extraction.
 */
export function deriveActiveReportType(pathname: string): SafeReportType {
  const lower = pathname.toLowerCase();

  if (lower.includes('members') || lower.includes('athlete')) return 'MEMBERSHIPS_HEALTH';
  if (lower.includes('events') || lower.includes('competition')) return 'EVENTS_SUMMARY';
  if (lower.includes('billing') || lower.includes('finance') || lower.includes('financial')) return 'BILLING_STATUS';
  if (lower.includes('audit') || lower.includes('log')) return 'AUDIT_TRAIL';

  return 'TENANT_OVERVIEW';
}

/**
 * Validate that a value is a valid SafeReportType.
 */
export function isValidReportType(v: unknown): v is SafeReportType {
  if (typeof v !== 'string') return false;
  return SAFE_REPORT_TYPES.includes(v as SafeReportType);
}

/**
 * Validate that a value is a valid SafeReportViewState.
 */
export function isValidReportViewState(v: unknown): v is SafeReportViewState {
  if (typeof v !== 'string') return false;
  return SAFE_REPORT_VIEW_STATES.includes(v as SafeReportViewState);
}
