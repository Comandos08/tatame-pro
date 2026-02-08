/**
 * TENANT LIFECYCLE — SAFE GOLD v1.0
 * Subset congelado para E2E e observabilidade.
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
