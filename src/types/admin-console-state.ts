/**
 * ADMIN CONSOLE SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado.
 * NÃO representa o domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

export type SafeAdminRole =
  | 'SUPERADMIN_GLOBAL'
  | 'ADMIN_TENANT'
  | 'NONE';

export type AdminViewState =
  | 'LOADING'
  | 'READY'
  | 'ERROR';

export type AdminMode =
  | 'ON'
  | 'OFF';

export const SAFE_ADMIN_ROLES: readonly SafeAdminRole[] = [
  'SUPERADMIN_GLOBAL',
  'ADMIN_TENANT',
  'NONE',
] as const;

export const SAFE_ADMIN_VIEW_STATES: readonly AdminViewState[] = [
  'LOADING',
  'READY',
  'ERROR',
] as const;

export const SAFE_ADMIN_MODES: readonly AdminMode[] = [
  'ON',
  'OFF',
] as const;

/**
 * Production → SAFE GOLD mapping (roles)
 * Aceita variações de nomenclatura sem quebrar testes.
 */
export const PRODUCTION_TO_SAFE_ADMIN_ROLE: Record<string, SafeAdminRole> = {
  'SUPERADMIN_GLOBAL': 'SUPERADMIN_GLOBAL',
  'SUPERADMIN': 'SUPERADMIN_GLOBAL',
  'ADMIN_GLOBAL': 'SUPERADMIN_GLOBAL',

  'ADMIN_TENANT': 'ADMIN_TENANT',
  'TENANT_ADMIN': 'ADMIN_TENANT',
  'ADMIN': 'ADMIN_TENANT',
};
