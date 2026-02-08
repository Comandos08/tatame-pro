/**
 * EXPORTS SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado para exportações CSV/PDF.
 * NÃO representa domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

// ============================================
// EXPORTS1.0 — EXPORT TYPE ENUMS
// ============================================

/**
 * SAFE GOLD Export Types
 */
export const SAFE_EXPORT_TYPES = [
  'CSV',
  'PDF',
] as const;

export type SafeExportType = typeof SAFE_EXPORT_TYPES[number];

/**
 * SAFE GOLD Export View States
 * - READY: Export available, waiting for user action
 * - GENERATING: Export in progress
 * - DONE: Export completed successfully
 * - ERROR: Export failed
 */
export const SAFE_EXPORT_VIEW_STATES = [
  'READY',
  'GENERATING',
  'DONE',
  'ERROR',
] as const;

export type SafeExportViewState = typeof SAFE_EXPORT_VIEW_STATES[number];

/**
 * Protected tables — NO mutations allowed during export operations
 */
export const EXPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'memberships',
  'athletes',
  'events',
  'reports',
  'tenant_billing',
  'tenant_invoices',
] as const;

export type ExportsProtectedTable = typeof EXPORTS_PROTECTED_TABLES[number];

/**
 * Production → SAFE GOLD mapping (export types)
 */
export const PRODUCTION_TO_SAFE_EXPORT_TYPE: Record<string, SafeExportType> = {
  'CSV': 'CSV',
  'csv': 'CSV',
  'EXCEL': 'CSV',
  'excel': 'CSV',
  'SPREADSHEET': 'CSV',
  
  'PDF': 'PDF',
  'pdf': 'PDF',
  'REPORT': 'PDF',
  'report': 'PDF',
  'DOCUMENT': 'PDF',
};
