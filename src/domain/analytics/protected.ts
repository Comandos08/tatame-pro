/**
 * ANALYTICS SAFE GOLD — Protected Tables v2.0
 *
 * Tables that MUST NOT receive mutations during analytics operations.
 * Any POST/PUT/PATCH/DELETE to these tables during analytics browsing FAILS the test.
 */

export const ANALYTICS_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'memberships',
  'events',
  'event_brackets',
  'tenant_billing',
  'tenant_invoices',
] as const;

export type AnalyticsProtectedTable = typeof ANALYTICS_PROTECTED_TABLES[number];

/**
 * Check if a table is protected during analytics operations.
 */
export function isProtectedTable(tableName: string): boolean {
  return ANALYTICS_PROTECTED_TABLES.includes(tableName as AnalyticsProtectedTable);
}
