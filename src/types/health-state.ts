/**
 * HEALTH SAFE GOLD — v1.0 (HEALTH1.0)
 *
 * Contrato mínimo, estável e congelado para instrumentação + E2E.
 * System Health é ADMIN GLOBAL — não requer TenantContext ou Impersonation.
 */

// ============================================
// HEALTH1.0 — SAFE GOLD TYPES
// ============================================

export const SAFE_HEALTH_STATUSES = [
  'OK',
  'DEGRADED',
  'CRITICAL',
  'UNKNOWN',
] as const;

export type SafeHealthStatus = (typeof SAFE_HEALTH_STATUSES)[number];

export const SAFE_HEALTH_VIEW_STATES = [
  'OK',
  'EMPTY',
  'LOADING',
  'ERROR',
] as const;

export type SafeHealthViewState = (typeof SAFE_HEALTH_VIEW_STATES)[number];

/**
 * Access control rules for System Health
 */
export const HEALTH_ACCESS_RULE = {
  requiresRole: 'SUPERADMIN_GLOBAL',
  requiresImpersonation: false,
  tenantContext: 'forbidden',
} as const;

/**
 * Allowed roles for System Health access
 */
export const HEALTH_ALLOWED_ROLES = ['SUPERADMIN_GLOBAL'] as const;

export type HealthAllowedRole = (typeof HEALTH_ALLOWED_ROLES)[number];

/**
 * Access denial reasons
 */
export const HEALTH_ACCESS_DENIAL_REASONS = [
  'INSUFFICIENT_ROLE',
  'IMPERSONATION_FORBIDDEN',
  'NOT_AUTHENTICATED',
] as const;

export type HealthAccessDenialReason = (typeof HEALTH_ACCESS_DENIAL_REASONS)[number];

/**
 * Protected tables during health browsing — READ-ONLY
 */
export const HEALTH_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'tenant_billing',
  'audit_logs',
  'memberships',
  'events',
] as const;

export type HealthProtectedTable = (typeof HEALTH_PROTECTED_TABLES)[number];

/**
 * Check if a table is protected during health operations.
 */
export function isHealthProtectedTable(tableName: string): boolean {
  return HEALTH_PROTECTED_TABLES.includes(tableName as HealthProtectedTable);
}

/**
 * Default health status fallback
 */
export const DEFAULT_HEALTH_STATUS: SafeHealthStatus = 'UNKNOWN';

/**
 * Default view state fallback
 */
export const DEFAULT_HEALTH_VIEW_STATE: SafeHealthViewState = 'OK';
