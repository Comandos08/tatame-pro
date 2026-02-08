/**
 * IMPERSONATION SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado para instrumentação + E2E.
 * NÃO representa domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

export type ImpersonationState =
  | 'OFF'
  | 'ON';

export type ImpersonationRole =
  | 'SUPERADMIN'
  | 'TENANT_ADMIN'
  | 'UNKNOWN';

export type ImpersonationViewState =
  | 'LOADING'
  | 'READY'
  | 'ERROR';

export const SAFE_IMPERSONATION_STATES: readonly ImpersonationState[] = [
  'OFF',
  'ON',
] as const;

export const SAFE_IMPERSONATION_ROLES: readonly ImpersonationRole[] = [
  'SUPERADMIN',
  'TENANT_ADMIN',
  'UNKNOWN',
] as const;

export const SAFE_IMPERSONATION_VIEW_STATES: readonly ImpersonationViewState[] = [
  'LOADING',
  'READY',
  'ERROR',
] as const;
