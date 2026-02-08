/**
 * ADMIN CONSOLE SAFE GOLD — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import type { SafeAdminRole, AdminViewState, AdminMode } from '@/types/admin-console-state';
import {
  PRODUCTION_TO_SAFE_ADMIN_ROLE,
  SAFE_ADMIN_ROLES,
  SAFE_ADMIN_VIEW_STATES,
  SAFE_ADMIN_MODES,
} from '@/types/admin-console-state';

export function assertAdminRole(v: string | null | undefined): SafeAdminRole {
  const raw = (v ?? '').trim();
  if (!raw) return 'NONE';

  const upper = raw.toUpperCase();
  const mapped = PRODUCTION_TO_SAFE_ADMIN_ROLE[upper];
  if (mapped) return mapped;

  // Se já estiver no subset, aceita
  if (SAFE_ADMIN_ROLES.includes(upper as SafeAdminRole)) {
    return upper as SafeAdminRole;
  }

  return 'NONE';
}

export function assertAdminViewState(v: string): AdminViewState {
  return SAFE_ADMIN_VIEW_STATES.includes(v as AdminViewState)
    ? (v as AdminViewState)
    : 'ERROR';
}

export function assertAdminMode(v: string): AdminMode {
  return SAFE_ADMIN_MODES.includes(v as AdminMode)
    ? (v as AdminMode)
    : 'OFF';
}
