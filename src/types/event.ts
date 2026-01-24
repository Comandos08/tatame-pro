/**
 * Event Module Types - TATAME Platform
 * SAFE GOLD v2.2
 */

export type EventStatus = 
  | 'DRAFT' 
  | 'PUBLISHED' 
  | 'REGISTRATION_OPEN' 
  | 'REGISTRATION_CLOSED' 
  | 'ONGOING' 
  | 'FINISHED' 
  | 'ARCHIVED';

export type EventRegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';

export interface Event {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  status: EventStatus;
  is_public: boolean;
  sport_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventCategory {
  id: string;
  event_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  max_participants: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  category_id: string;
  athlete_id: string;
  tenant_id: string;
  status: EventRegistrationStatus;
  payment_status: 'NOT_PAID' | 'PAID' | 'FAILED';
  registered_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventResult {
  id: string;
  event_id: string;
  category_id: string;
  athlete_id: string;
  tenant_id: string;
  position: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // ⚠️ NO updated_at - RESULTS ARE IMMUTABLE
}

/**
 * 🚫 NO AUTOMATION RULE
 * 
 * Status transitions are NEVER automatic.
 * All transitions require EXPLICIT action by the organizer (Tenant Admin).
 * 
 * PROHIBITED automations:
 * - Changing to REGISTRATION_OPEN when start_date arrives
 * - Changing to ONGOING when event starts
 * - Changing to FINISHED when end_date passes
 * - Auto-archiving after X days
 * 
 * The human organizer is ALWAYS responsible for each transition.
 */
export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['REGISTRATION_OPEN', 'ARCHIVED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED'],
  REGISTRATION_CLOSED: ['ONGOING'],
  ONGOING: ['FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: [], // Terminal state - no transitions
};

export type EventStatusColor = 'muted' | 'info' | 'success' | 'warning' | 'purple' | 'slate';

export const EVENT_STATUS_CONFIG: Record<EventStatus, { 
  label: string; 
  labelKey: string;
  color: EventStatusColor;
  descriptionKey: string;
}> = {
  DRAFT: { 
    label: 'Rascunho', 
    labelKey: 'events.status.draft',
    color: 'muted',
    descriptionKey: 'events.status.draftDesc',
  },
  PUBLISHED: { 
    label: 'Publicado', 
    labelKey: 'events.status.published',
    color: 'info',
    descriptionKey: 'events.status.publishedDesc',
  },
  REGISTRATION_OPEN: { 
    label: 'Inscrições Abertas', 
    labelKey: 'events.status.registrationOpen',
    color: 'success',
    descriptionKey: 'events.status.registrationOpenDesc',
  },
  REGISTRATION_CLOSED: { 
    label: 'Inscrições Encerradas', 
    labelKey: 'events.status.registrationClosed',
    color: 'warning',
    descriptionKey: 'events.status.registrationClosedDesc',
  },
  ONGOING: { 
    label: 'Em Andamento', 
    labelKey: 'events.status.ongoing',
    color: 'purple',
    descriptionKey: 'events.status.ongoingDesc',
  },
  FINISHED: { 
    label: 'Finalizado', 
    labelKey: 'events.status.finished',
    color: 'slate',
    descriptionKey: 'events.status.finishedDesc',
  },
  ARCHIVED: { 
    label: 'Arquivado', 
    labelKey: 'events.status.archived',
    color: 'muted',
    descriptionKey: 'events.status.archivedDesc',
  },
};

export const EVENT_REGISTRATION_STATUS_CONFIG: Record<EventRegistrationStatus, {
  label: string;
  labelKey: string;
  color: 'warning' | 'success' | 'muted';
}> = {
  PENDING: {
    label: 'Pendente',
    labelKey: 'events.registration.pending',
    color: 'warning',
  },
  CONFIRMED: {
    label: 'Confirmada',
    labelKey: 'events.registration.confirmed',
    color: 'success',
  },
  CANCELED: {
    label: 'Cancelada',
    labelKey: 'events.registration.canceled',
    color: 'muted',
  },
};

// Helper to validate transition (used in frontend)
export function canTransitionTo(currentStatus: EventStatus, targetStatus: EventStatus): boolean {
  return EVENT_STATUS_TRANSITIONS[currentStatus].includes(targetStatus);
}

// Helper to get valid next transitions
export function getValidTransitions(currentStatus: EventStatus): EventStatus[] {
  return EVENT_STATUS_TRANSITIONS[currentStatus];
}

// Helper to check if registration is allowed
export function canRegisterForEvent(eventStatus: EventStatus): boolean {
  return eventStatus === 'REGISTRATION_OPEN';
}

// Helper to check if cancellation is allowed
export function canCancelRegistration(eventStatus: EventStatus): boolean {
  return eventStatus === 'REGISTRATION_OPEN' || eventStatus === 'REGISTRATION_CLOSED';
}

// Helper to check if results can be published
export function canPublishResults(eventStatus: EventStatus): boolean {
  return eventStatus === 'FINISHED';
}
