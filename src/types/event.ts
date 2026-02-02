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
  | 'ARCHIVED'
  | 'CANCELLED';

export type EventRegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';

// P2.3 — Competition Categories
export type CategoryGender = 'MALE' | 'FEMALE' | 'MIXED';

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
  // Competition fields (P2.3)
  gender: CategoryGender | null;
  min_weight: number | null;
  max_weight: number | null;
  min_age: number | null;
  max_age: number | null;
  belt_min_id: string | null;
  belt_max_id: string | null;
  deleted_at: string | null;
  // Payment fields (P3)
  price_cents: number;
  currency: string;
  max_participants: number | null;
  is_active: boolean;
  // Timestamps
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
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'CANCELLED'],
  REGISTRATION_CLOSED: ['ONGOING', 'CANCELLED'],
  ONGOING: ['FINISHED', 'CANCELLED'],
  FINISHED: ['ARCHIVED'],  // Terminal - cannot cancel after finished
  ARCHIVED: [],            // Terminal state
  CANCELLED: [],           // Terminal state
};

export type EventStatusColor = 'muted' | 'info' | 'success' | 'warning' | 'purple' | 'slate' | 'destructive';

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
  CANCELLED: { 
    label: 'Cancelado', 
    labelKey: 'events.status.cancelled',
    color: 'destructive',
    descriptionKey: 'events.status.cancelledDesc',
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

// Helper to check if event can be soft deleted
export function canDeleteEvent(eventStatus: EventStatus): boolean {
  return eventStatus === 'DRAFT' || eventStatus === 'CANCELLED';
}

// P2.3 — Helper to check if categories can be edited
export function canEditCategories(eventStatus: EventStatus): boolean {
  return eventStatus === 'DRAFT' || eventStatus === 'PUBLISHED' || eventStatus === 'REGISTRATION_OPEN';
}

// ============================================================================
// P2.4 — Brackets / Chaves
// ============================================================================

export type BracketStatus = 'DRAFT' | 'PUBLISHED';

export interface EventBracket {
  id: string;
  tenant_id: string;
  event_id: string;
  category_id: string;
  version: number;
  status: BracketStatus;
  generated_by: string | null;
  generated_at: string;
  published_at: string | null;
  notes: string | null;
  meta: BracketMeta;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BracketMeta {
  criterion: string;
  registrations_count: number;
  bracket_size: number;
  byes_count: number;
  registration_ids_hash?: string;
}

export interface EventBracketMatch {
  id: string;
  tenant_id: string;
  bracket_id: string;
  category_id: string;
  round: number;
  position: number;
  athlete1_registration_id: string | null;
  athlete2_registration_id: string | null;
  winner_registration_id: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'BYE';
  meta: MatchMeta;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MatchMeta {
  note?: string;
  source?: { from: string[] };
  is_bye?: boolean;
}

// Helper: can generate bracket for this event status
export function canGenerateBracket(eventStatus: EventStatus): boolean {
  return eventStatus === 'REGISTRATION_OPEN' || eventStatus === 'REGISTRATION_CLOSED';
}

// Helper: is bracket visible publicly
export function canViewBracketPublic(eventStatus: EventStatus): boolean {
  return !['DRAFT', 'ARCHIVED', 'CANCELLED'].includes(eventStatus);
}
