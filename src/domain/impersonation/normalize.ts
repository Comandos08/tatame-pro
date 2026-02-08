/**
 * IMPERSONATION SAFE GOLD — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import type {
  ImpersonationState,
  ImpersonationRole,
  ImpersonationViewState,
} from '@/types/impersonation-state';

const STATE: ImpersonationState[] = ['OFF', 'ON'];
const ROLE: ImpersonationRole[] = ['SUPERADMIN', 'TENANT_ADMIN', 'UNKNOWN'];
const VIEW: ImpersonationViewState[] = ['LOADING', 'READY', 'ERROR'];

export function assertImpersonationState(v: string | null | undefined): ImpersonationState {
  const s = (v || '').toUpperCase();
  return STATE.includes(s as ImpersonationState) ? (s as ImpersonationState) : 'OFF';
}

export function assertImpersonationRole(v: string | null | undefined): ImpersonationRole {
  const s = (v || '').toUpperCase();
  if (s.includes('SUPER')) return 'SUPERADMIN';
  if (s.includes('ADMIN')) return 'TENANT_ADMIN';
  return ROLE.includes(s as ImpersonationRole) ? (s as ImpersonationRole) : 'UNKNOWN';
}

export function assertImpersonationViewState(v: string | null | undefined): ImpersonationViewState {
  const s = (v || '').toUpperCase();
  return VIEW.includes(s as ImpersonationViewState) ? (s as ImpersonationViewState) : 'ERROR';
}
