/**
 * TENANT LIFECYCLE — SAFE GOLD v1.1
 * Explicit states for tenant lifecycle management.
 * 
 * Database column: tenants.lifecycle_status (enum: tenant_lifecycle_status)
 * 
 * PI-GOV-001: Extended with SUSPENDED and TERMINATED.
 * Mutation only via change_tenant_lifecycle_state() gatekeeper.
 */

/**
 * Canonical tenant lifecycle states (database enum)
 */
export type TenantLifecycleStatus = 'SETUP' | 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' | 'TERMINATED';

/**
 * Extended states for E2E/observability (includes DELETED as alias for TERMINATED)
 */
export type TenantLifecycleState =
  | 'SETUP'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'SUSPENDED'
  | 'TERMINATED'
  | 'DELETED';

export const SAFE_TENANT_STATES: readonly TenantLifecycleState[] = [
  'SETUP',
  'ACTIVE',
  'BLOCKED',
  'SUSPENDED',
  'TERMINATED',
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
  SUSPENDED: 'SUSPENDED',
  TERMINATED: 'TERMINATED',
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
  SUSPENDED: 'Suspenso',
  TERMINATED: 'Encerrado',
};
