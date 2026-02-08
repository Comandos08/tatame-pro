/**
 * ATHLETE PORTAL SAFE GOLD — v1.0
 *
 * Contrato mínimo e estável para instrumentação + E2E.
 * ⚠️ Não é o domínio completo. É um SUBSET congelado.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

export type PortalViewState =
  | 'LOADING'
  | 'READY'
  | 'EMPTY'
  | 'ERROR';

export type MembershipState =
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'NONE';

export type CardState =
  | 'VALID'
  | 'INVALID'
  | 'NONE';

export const SAFE_PORTAL_VIEW_STATES: readonly PortalViewState[] = [
  'LOADING', 'READY', 'EMPTY', 'ERROR',
] as const;

export const SAFE_MEMBERSHIP_STATES: readonly MembershipState[] = [
  'ACTIVE', 'EXPIRING', 'EXPIRED', 'NONE',
] as const;

export const SAFE_CARD_STATES: readonly CardState[] = [
  'VALID', 'INVALID', 'NONE',
] as const;
