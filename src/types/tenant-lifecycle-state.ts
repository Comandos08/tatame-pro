/**
 * TENANT LIFECYCLE — SAFE GOLD v1.1
 * Explicit states for tenant lifecycle management.
 * 
 * Database column: tenants.lifecycle_status (enum: tenant_lifecycle_status)
 */

/**
 * Canonical tenant lifecycle states (database enum)
 */
export type TenantLifecycleStatus = 'SETUP' | 'ACTIVE' | 'BLOCKED';

/**
 * Extended states for E2E/observability (includes DELETED)
 */
export type TenantLifecycleState =
  | 'SETUP'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'DELETED';

export const SAFE_TENANT_STATES: readonly TenantLifecycleState[] = [
  'SETUP',
  'ACTIVE',
  'BLOCKED',
  'DELETED',
] as const;

/**
 * Production → SAFE GOLD mapping
 * Maps any production status to SAFE GOLD subset.
 */
export const PROD_TENANT_TO_SAFE: Record<string, TenantLifecycleState> = {
  SETUP: 'SETUP',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  SUSPENDED: 'BLOCKED',
  PENDING_DELETE: 'BLOCKED',
  DELETED: 'DELETED',
};

/**
 * Status display labels
 */
export const TENANT_LIFECYCLE_LABELS: Record<TenantLifecycleStatus, string> = {
  SETUP: 'Em Configuração',
  ACTIVE: 'Ativo',
  BLOCKED: 'Bloqueado',
};
