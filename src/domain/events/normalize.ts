/**
 * Events Normalizers — PI E1.0
 *
 * Pure functions to normalize/validate event states.
 * No side effects. No date/time logic.
 */

import type { EventState, RegistrationState } from '@/types/events-state';

const EVENT_STATES: EventState[] = [
  'DRAFT',
  'PUBLISHED',
  'ONGOING',
  'FINISHED',
  'CANCELED',
];

const REGISTRATION_STATES: RegistrationState[] = [
  'PENDING',
  'CONFIRMED',
  'CANCELED',
];

/**
 * Asserts and normalizes an event state value.
 * Falls back to 'DRAFT' for unknown values.
 */
export function assertEventState(v: string): EventState {
  return EVENT_STATES.includes(v as EventState)
    ? (v as EventState)
    : 'DRAFT';
}

/**
 * Asserts and normalizes a registration state value.
 * Falls back to 'PENDING' for unknown values.
 */
export function assertRegistrationState(v: string): RegistrationState {
  return REGISTRATION_STATES.includes(v as RegistrationState)
    ? (v as RegistrationState)
    : 'PENDING';
}
