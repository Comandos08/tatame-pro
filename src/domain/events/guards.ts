/**
 * E1.0.1 — EVENTS GUARDS v1.1
 *
 * Pure functions for event state validation.
 * SAFE GOLD: deterministic, no side effects.
 * 
 * HARDENING: All Date operations delegated to src/lib/time.ts
 */

import type { EventEntity, EventPermissions } from './types';
import type { SafeEventStatus, SafeBracketStatus } from './safeEnums';
import { isValidEventTransition, isValidBracketTransition } from './safeEnums';
import { toEpoch } from '@/lib/time';

/**
 * Check if event is editable.
 * Only DRAFT events can be edited.
 */
export function isEventEditable(status: SafeEventStatus): boolean {
  return status === 'DRAFT';
}

/**
 * Check if event is publicly visible.
 * Only PUBLISHED events are visible to public.
 */
export function isEventPubliclyVisible(status: SafeEventStatus, isPublic: boolean): boolean {
  return status === 'PUBLISHED' && isPublic;
}

/**
 * Check if categories can be modified.
 * Only possible when event is DRAFT.
 */
export function canModifyCategories(eventStatus: SafeEventStatus): boolean {
  return eventStatus === 'DRAFT';
}

/**
 * Check if brackets can be generated.
 * Event must be PUBLISHED or DRAFT (for preview).
 */
export function canGenerateBrackets(eventStatus: SafeEventStatus): boolean {
  return eventStatus === 'DRAFT' || eventStatus === 'PUBLISHED';
}

/**
 * Check if bracket can be regenerated.
 * Only DRAFT or GENERATED brackets can be regenerated.
 */
export function canRegenerateBracket(bracketStatus: SafeBracketStatus): boolean {
  return bracketStatus === 'DRAFT' || bracketStatus === 'GENERATED';
}

/**
 * Check if bracket can be published.
 * Only GENERATED brackets can be published.
 */
export function canPublishBracket(bracketStatus: SafeBracketStatus): boolean {
  return bracketStatus === 'GENERATED';
}

/**
 * Check if bracket is locked (immutable).
 * PUBLISHED and LOCKED brackets cannot be modified.
 */
export function isBracketLocked(bracketStatus: SafeBracketStatus): boolean {
  return bracketStatus === 'PUBLISHED' || bracketStatus === 'LOCKED';
}

/**
 * Check if registrations are open.
 */
export function areRegistrationsOpen(
  event: Pick<EventEntity, 'status' | 'registrationOpensAt' | 'registrationClosesAt'>,
  currentTimestamp: string
): boolean {
  if (event.status !== 'PUBLISHED') return false;
  
  const now = toEpoch(currentTimestamp);
  
  if (event.registrationOpensAt) {
    const opens = toEpoch(event.registrationOpensAt);
    if (now < opens) return false;
  }
  
  if (event.registrationClosesAt) {
    const closes = toEpoch(event.registrationClosesAt);
    if (now > closes) return false;
  }
  
  return true;
}

/**
 * Derive permissions for an event based on status and role.
 */
export function deriveEventPermissions(
  status: SafeEventStatus,
  isAdmin: boolean
): EventPermissions {
  if (!isAdmin) {
    return {
      canEdit: false,
      canPublish: false,
      canCancel: false,
      canArchive: false,
      canManageCategories: false,
      canManageBrackets: false,
      canManageRegistrations: false,
    };
  }

  return {
    canEdit: isEventEditable(status),
    canPublish: status === 'DRAFT',
    canCancel: status === 'PUBLISHED',
    canArchive: status === 'CANCELLED',
    canManageCategories: canModifyCategories(status),
    canManageBrackets: status === 'DRAFT' || status === 'PUBLISHED',
    canManageRegistrations: status === 'PUBLISHED',
  };
}

/**
 * Validate event status transition.
 * Returns error message if invalid, null if valid.
 */
export function validateEventTransition(
  from: SafeEventStatus,
  to: SafeEventStatus
): string | null {
  if (!isValidEventTransition(from, to)) {
    return `Cannot transition event from ${from} to ${to}`;
  }
  return null;
}

/**
 * Validate bracket status transition.
 * Returns error message if invalid, null if valid.
 */
export function validateBracketTransition(
  from: SafeBracketStatus,
  to: SafeBracketStatus
): string | null {
  if (!isValidBracketTransition(from, to)) {
    return `Cannot transition bracket from ${from} to ${to}`;
  }
  return null;
}

/**
 * Check if event can accept new registrations.
 */
export function canAcceptRegistrations(
  event: Pick<EventEntity, 'status' | 'registrationOpensAt' | 'registrationClosesAt' | 'maxParticipants'>,
  currentRegistrations: number,
  currentTimestamp: string
): { allowed: boolean; reason?: string } {
  if (event.status !== 'PUBLISHED') {
    return { allowed: false, reason: 'Event is not published' };
  }

  if (!areRegistrationsOpen(event, currentTimestamp)) {
    return { allowed: false, reason: 'Registrations are closed' };
  }

  if (event.maxParticipants && currentRegistrations >= event.maxParticipants) {
    return { allowed: false, reason: 'Event is at capacity' };
  }

  return { allowed: true };
}

/**
 * Derive view state from event data.
 */
export function deriveEventViewState(
  isLoading: boolean,
  hasError: boolean,
  event: EventEntity | null
): 'LOADING' | 'READY' | 'ERROR' | 'NOT_FOUND' {
  if (isLoading) return 'LOADING';
  if (hasError) return 'ERROR';
  if (!event) return 'NOT_FOUND';
  return 'READY';
}
