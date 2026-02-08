/**
 * REPORTS SAFE GOLD — v1.0 (REPORTS1.0)
 *
 * Contrato mínimo, estável e congelado para instrumentação + E2E.
 * NÃO representa domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

// ============================================
// REPORTS1.0 — SAFE GOLD TYPES
// ============================================

export const SAFE_REPORT_TYPES = [
  'TENANT_OVERVIEW',
  'MEMBERSHIPS_HEALTH',
  'EVENTS_SUMMARY',
  'BILLING_STATUS',
  'AUDIT_TRAIL',
] as const;

export type SafeReportType = (typeof SAFE_REPORT_TYPES)[number];

export const SAFE_REPORT_VIEW_STATES = [
  'OK',
  'EMPTY',
  'PARTIAL',
  'ERROR',
  'LOADING',
] as const;

export type SafeReportViewState = (typeof SAFE_REPORT_VIEW_STATES)[number];

/**
 * Production → SAFE GOLD mapping (report types)
 * Aceita variações de nomenclatura sem quebrar testes.
 */
export const PRODUCTION_TO_SAFE_REPORT_TYPE: Record<string, SafeReportType> = {
  // TENANT_OVERVIEW mappings
  'TENANT': 'TENANT_OVERVIEW',
  'TENANT_OVERVIEW': 'TENANT_OVERVIEW',
  'OVERVIEW': 'TENANT_OVERVIEW',
  'DASHBOARD': 'TENANT_OVERVIEW',
  'SUMMARY': 'TENANT_OVERVIEW',

  // MEMBERSHIPS_HEALTH mappings
  'MEMBERSHIPS': 'MEMBERSHIPS_HEALTH',
  'MEMBERSHIPS_HEALTH': 'MEMBERSHIPS_HEALTH',
  'MEMBERSHIP_HEALTH': 'MEMBERSHIPS_HEALTH',
  'MEMBERS': 'MEMBERSHIPS_HEALTH',
  'ATHLETES': 'MEMBERSHIPS_HEALTH',

  // EVENTS_SUMMARY mappings
  'EVENTS': 'EVENTS_SUMMARY',
  'EVENTS_SUMMARY': 'EVENTS_SUMMARY',
  'EVENTS_REPORT': 'EVENTS_SUMMARY',
  'COMPETITIONS': 'EVENTS_SUMMARY',

  // BILLING_STATUS mappings
  'BILLING': 'BILLING_STATUS',
  'BILLING_STATUS': 'BILLING_STATUS',
  'FINANCE': 'BILLING_STATUS',
  'FINANCIAL': 'BILLING_STATUS',
  'PAYMENTS': 'BILLING_STATUS',

  // AUDIT_TRAIL mappings
  'AUDIT': 'AUDIT_TRAIL',
  'AUDIT_TRAIL': 'AUDIT_TRAIL',
  'AUDIT_LOGS': 'AUDIT_TRAIL',
  'LOGS': 'AUDIT_TRAIL',
};

/**
 * Default report type fallback
 */
export const DEFAULT_REPORT_TYPE: SafeReportType = 'TENANT_OVERVIEW';

/**
 * Default view state fallback
 */
export const DEFAULT_REPORT_VIEW_STATE: SafeReportViewState = 'OK';
