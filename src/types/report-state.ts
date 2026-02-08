/**
 * REPORTS SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado para instrumentação + E2E.
 * NÃO representa domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

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
