/**
 * REPORTS SAFE GOLD — v1.0 + REPORTS1.0
 *
 * Contrato mínimo, estável e congelado para instrumentação + E2E.
 * NÃO representa domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

// ============================================
// R1.0 — ORIGINAL SAFE GOLD SUBSET
// ============================================

export type SafeReportType =
  | 'OVERVIEW'
  | 'FINANCIAL'
  | 'ATTENDANCE'
  | 'ATHLETES'
  | 'EVENTS';

export type SafeReportScope =
  | 'TENANT'
  | 'GLOBAL';

export type ReportViewState =
  | 'LOADING'
  | 'READY'
  | 'ERROR';

export const SAFE_REPORT_TYPES: readonly SafeReportType[] = [
  'OVERVIEW',
  'FINANCIAL',
  'ATTENDANCE',
  'ATHLETES',
  'EVENTS',
] as const;

export const SAFE_REPORT_SCOPES: readonly SafeReportScope[] = [
  'TENANT',
  'GLOBAL',
] as const;

export const SAFE_REPORT_VIEW_STATES: readonly ReportViewState[] = [
  'LOADING',
  'READY',
  'ERROR',
] as const;

/**
 * Production → SAFE GOLD mapping (report types)
 * Aceita variações de nomenclatura sem quebrar testes.
 */
export const PRODUCTION_TO_SAFE_REPORT_TYPE: Record<string, SafeReportType> = {
  'OVERVIEW': 'OVERVIEW',
  'DASHBOARD': 'OVERVIEW',
  'SUMMARY': 'OVERVIEW',
  
  'FINANCIAL': 'FINANCIAL',
  'FINANCE': 'FINANCIAL',
  'BILLING': 'FINANCIAL',
  'PAYMENTS': 'FINANCIAL',
  
  'ATTENDANCE': 'ATTENDANCE',
  'PRESENCE': 'ATTENDANCE',
  'CHECK_IN': 'ATTENDANCE',
  
  'ATHLETES': 'ATHLETES',
  'ATHLETE': 'ATHLETES',
  'MEMBERS': 'ATHLETES',
  'MEMBERSHIPS': 'ATHLETES',
  
  'EVENTS': 'EVENTS',
  'EVENT': 'EVENTS',
  'COMPETITIONS': 'EVENTS',
};

/**
 * Production → SAFE GOLD mapping (report scopes)
 */
export const PRODUCTION_TO_SAFE_REPORT_SCOPE: Record<string, SafeReportScope> = {
  'TENANT': 'TENANT',
  'ORGANIZATION': 'TENANT',
  'ORG': 'TENANT',
  'LOCAL': 'TENANT',
  
  'GLOBAL': 'GLOBAL',
  'PLATFORM': 'GLOBAL',
  'SYSTEM': 'GLOBAL',
  'ALL': 'GLOBAL',
};

// ============================================
// REPORTS1.0 — ANALYTICS HARDENING EXTENSIONS
// ============================================

/**
 * SAFE GOLD Report Modes (Analytics contexts)
 */
export const SAFE_REPORT_MODES = [
  'GLOBAL',
  'TENANT',
] as const;

export type SafeReportMode = typeof SAFE_REPORT_MODES[number];

/**
 * SAFE GOLD Analytics View States (extended)
 * - OK: Data loaded successfully
 * - EMPTY: No data available (not an error)
 * - PARTIAL: Incomplete data (degraded mode)
 * - ERROR: Failed to load
 */
export const SAFE_ANALYTICS_VIEW_STATES = [
  'OK',
  'EMPTY',
  'PARTIAL',
  'ERROR',
] as const;

export type SafeAnalyticsViewState = typeof SAFE_ANALYTICS_VIEW_STATES[number];

/**
 * Protected tables — NO mutations allowed during reports/analytics browsing
 */
export const REPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'academies',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
] as const;

export type ReportsProtectedTable = typeof REPORTS_PROTECTED_TABLES[number];
