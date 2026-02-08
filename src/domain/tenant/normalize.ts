/**
 * TENANT LIFECYCLE — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import {
  TenantLifecycleState,
  SAFE_TENANT_STATES,
  PROD_TENANT_TO_SAFE,
} from '@/types/tenant-lifecycle-state';

export function assertTenantLifecycleState(
  raw: string | null | undefined
): TenantLifecycleState {
  if (!raw) return 'SETUP';

  const upper = raw.toUpperCase();
  
  // Direct match to SAFE states
  if (SAFE_TENANT_STATES.includes(upper as TenantLifecycleState)) {
    return upper as TenantLifecycleState;
  }

  // Map production states to SAFE subset
  return PROD_TENANT_TO_SAFE[upper] ?? 'SETUP';
}
