/**
 * YOUTH MEMBERSHIP SAFE GOLD — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date.now(), new Date(), or IO dependencies.
 * All age calculations use explicit reference date.
 */

import type {
  YouthMembershipType,
  YouthMembershipViewState,
  YouthEligibility,
} from '@/types/youth-membership-state';

import {
  SAFE_YOUTH_MEMBERSHIP_TYPES,
  SAFE_YOUTH_VIEW_STATES,
  YOUTH_AGE_THRESHOLD,
  PRODUCTION_TO_SAFE_MEMBERSHIP_TYPE,
} from '@/types/youth-membership-state';

/**
 * Assert membership type belongs to SAFE GOLD subset.
 * Falls back to 'ADULT' for unknown values.
 */
export function assertYouthMembershipType(v: string | null | undefined): YouthMembershipType {
  const raw = (v ?? '').trim();
  if (!raw) return 'ADULT';

  const upper = raw.toUpperCase();
  
  // Direct match in SAFE subset
  if (SAFE_YOUTH_MEMBERSHIP_TYPES.includes(upper as YouthMembershipType)) {
    return upper as YouthMembershipType;
  }
  
  // Production mapping
  const mapped = PRODUCTION_TO_SAFE_MEMBERSHIP_TYPE[upper];
  if (mapped) return mapped;

  return 'ADULT';
}

/**
 * Assert view state belongs to SAFE GOLD subset.
 * Falls back to 'ERROR' for unknown values.
 */
export function assertYouthViewState(v: string | null | undefined): YouthMembershipViewState {
  const raw = (v ?? '').trim();
  if (!raw) return 'ERROR';

  const upper = raw.toUpperCase();
  
  if (SAFE_YOUTH_VIEW_STATES.includes(upper as YouthMembershipViewState)) {
    return upper as YouthMembershipViewState;
  }

  return 'ERROR';
}

/**
 * DETERMINISTIC age calculation.
 * Does NOT use Date.now() or new Date() for current time.
 * 
 * @param birthDateIso - ISO date string (YYYY-MM-DD)
 * @param referenceDate - Reference date for calculation (must be provided explicitly)
 * @returns Age in complete years
 */
export function calculateAgeDeterministic(
  birthDateIso: string,
  referenceDate: Date
): number {
  const birth = new Date(birthDateIso);
  
  if (isNaN(birth.getTime())) {
    return -1; // Invalid date
  }

  let age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  const dayDiff = referenceDate.getDate() - birth.getDate();

  // Hasn't had birthday this year yet
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

/**
 * DETERMINISTIC eligibility check for Youth membership.
 * 
 * @param birthDateIso - ISO date string (YYYY-MM-DD)
 * @param referenceDate - Reference date for calculation (must be provided explicitly)
 * @returns YouthEligibility state
 */
export function assertYouthEligibility(
  birthDateIso: string | null | undefined,
  referenceDate: Date
): YouthEligibility {
  if (!birthDateIso) return 'UNKNOWN';

  const age = calculateAgeDeterministic(birthDateIso, referenceDate);
  
  if (age < 0) return 'UNKNOWN';
  if (age < YOUTH_AGE_THRESHOLD) return 'ELIGIBLE';
  return 'INELIGIBLE';
}

/**
 * Resolve membership type based on age.
 * 
 * @param birthDateIso - ISO date string (YYYY-MM-DD)
 * @param referenceDate - Reference date for calculation (must be provided explicitly)
 * @returns YouthMembershipType
 */
export function resolveMembershipTypeByAge(
  birthDateIso: string | null | undefined,
  referenceDate: Date
): YouthMembershipType {
  const eligibility = assertYouthEligibility(birthDateIso, referenceDate);
  
  if (eligibility === 'ELIGIBLE') return 'YOUTH';
  return 'ADULT';
}
