/**
 * REPORTS SAFE GOLD — Barrel Export v1.0
 */

// Types
export type { SafeReportType, SafeReportViewState } from '@/types/reports-state';
export {
  SAFE_REPORT_TYPES,
  SAFE_REPORT_VIEW_STATES,
  PRODUCTION_TO_SAFE_REPORT_TYPE,
  DEFAULT_REPORT_TYPE,
  DEFAULT_REPORT_VIEW_STATE,
} from '@/types/reports-state';

// Protected tables
export { REPORTS_PROTECTED_TABLES, isReportsProtectedTable } from './protected';
export type { ReportsProtectedTable } from './protected';

// Normalizers
export {
  normalizeReportsViewState,
  assertReportType,
  isReportsRoute,
  deriveActiveReportType,
  isValidReportType,
  isValidReportViewState,
} from './normalizeReports';

// Read API
export { fetchReport, fetchMembershipsHealthReport, fetchEventsSummaryReport } from './read';
export type { ReportsQueryParams, ReportsReadResult } from './read';
