/**
 * REPORTS SAFE GOLD — Protected Tables v1.0
 *
 * Tables that MUST NOT receive mutations during reports operations.
 * Any POST/PUT/PATCH/DELETE to these tables during reports browsing FAILS the test.
 */

export const REPORTS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'memberships',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
  'audit_logs',
  'diplomas',
  'coaches',
  'academies',
] as const;

export type ReportsProtectedTable = (typeof REPORTS_PROTECTED_TABLES)[number];

/**
 * Check if a table is protected during reports operations.
 */
export function isReportsProtectedTable(tableName: string): boolean {
  return REPORTS_PROTECTED_TABLES.includes(tableName as ReportsProtectedTable);
}
