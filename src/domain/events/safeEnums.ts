/**
 * E1.0 — EVENTS SAFE GOLD ENUMS v1.0
 *
 * Immutable state contracts for Events module.
 * SAFE GOLD: deterministic, no expansion without new PI.
 */

export const SAFE_EVENT_STATUS = [
  'DRAFT',
  'PUBLISHED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export type SafeEventStatus = typeof SAFE_EVENT_STATUS[number];

export const SAFE_BRACKET_STATUS = [
  'DRAFT',
  'GENERATED',
  'PUBLISHED',
  'LOCKED',
] as const;

export type SafeBracketStatus = typeof SAFE_BRACKET_STATUS[number];

export const SAFE_REGISTRATION_STATUS = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'WAITLIST',
] as const;

export type SafeRegistrationStatus = typeof SAFE_REGISTRATION_STATUS[number];

export const SAFE_CATEGORY_GENDER = [
  'MALE',
  'FEMALE',
  'MIXED',
] as const;

export type SafeCategoryGender = typeof SAFE_CATEGORY_GENDER[number];

/**
 * Valid event status transitions.
 * Enforced at domain level before any mutation.
 */
export const EVENT_STATUS_TRANSITIONS: Record<SafeEventStatus, SafeEventStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['CANCELLED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

/**
 * Valid bracket status transitions.
 */
export const BRACKET_STATUS_TRANSITIONS: Record<SafeBracketStatus, SafeBracketStatus[]> = {
  DRAFT: ['GENERATED'],
  GENERATED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['LOCKED'],
  LOCKED: [],
};

/**
 * Normalize raw status to SAFE event status.
 * Unknown values default to DRAFT.
 */
export function normalizeEventStatus(rawStatus?: string | null): SafeEventStatus {
  if (!rawStatus) return 'DRAFT';
  const upper = rawStatus.toUpperCase();
  if (SAFE_EVENT_STATUS.includes(upper as SafeEventStatus)) {
    return upper as SafeEventStatus;
  }
  return 'DRAFT';
}

/**
 * Normalize raw status to SAFE bracket status.
 * Unknown values default to DRAFT.
 */
export function normalizeBracketStatus(rawStatus?: string | null): SafeBracketStatus {
  if (!rawStatus) return 'DRAFT';
  const upper = rawStatus.toUpperCase();
  if (SAFE_BRACKET_STATUS.includes(upper as SafeBracketStatus)) {
    return upper as SafeBracketStatus;
  }
  return 'DRAFT';
}

/**
 * Check if event status transition is valid.
 */
export function isValidEventTransition(
  from: SafeEventStatus,
  to: SafeEventStatus
): boolean {
  return EVENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check if bracket status transition is valid.
 */
export function isValidBracketTransition(
  from: SafeBracketStatus,
  to: SafeBracketStatus
): boolean {
  return BRACKET_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
