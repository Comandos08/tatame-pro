/**
 * YOUTH MEMBERSHIP SAFE GOLD — v1.0
 *
 * Contrato mínimo, estável e congelado para instrumentação + E2E.
 * NÃO representa domínio completo.
 * Qualquer expansão exige novo PI SAFE GOLD.
 */

export type YouthMembershipType =
  | 'YOUTH'
  | 'ADULT';

export type YouthMembershipViewState =
  | 'LOADING'
  | 'READY'
  | 'ERROR';

export type YouthEligibility =
  | 'ELIGIBLE'
  | 'INELIGIBLE'
  | 'UNKNOWN';

export const SAFE_YOUTH_MEMBERSHIP_TYPES: readonly YouthMembershipType[] = [
  'YOUTH',
  'ADULT',
] as const;

export const SAFE_YOUTH_VIEW_STATES: readonly YouthMembershipViewState[] = [
  'LOADING',
  'READY',
  'ERROR',
] as const;

export const SAFE_YOUTH_ELIGIBILITY: readonly YouthEligibility[] = [
  'ELIGIBLE',
  'INELIGIBLE',
  'UNKNOWN',
] as const;

/**
 * Youth age threshold (under 18)
 */
export const YOUTH_AGE_THRESHOLD = 18;

/**
 * Production → SAFE GOLD mapping (membership types)
 */
export const PRODUCTION_TO_SAFE_MEMBERSHIP_TYPE: Record<string, YouthMembershipType> = {
  'YOUTH': 'YOUTH',
  'MINOR': 'YOUTH',
  'JUNIOR': 'YOUTH',
  'CHILD': 'YOUTH',
  
  'ADULT': 'ADULT',
  'SENIOR': 'ADULT',
  'REGULAR': 'ADULT',
};
