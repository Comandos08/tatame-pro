/**
 * E1.0 — EVENTS DOMAIN TYPES v1.0
 *
 * Type definitions for Events module.
 * SAFE GOLD: immutable contracts.
 */

import type {
  SafeEventStatus,
  SafeBracketStatus,
  SafeRegistrationStatus,
  SafeCategoryGender,
} from './safeEnums';

/**
 * Event entity (normalized from database).
 */
export interface EventEntity {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  eventDate: string;
  eventEndDate: string | null;
  location: string | null;
  status: SafeEventStatus;
  isPublic: boolean;
  bannerUrl: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  maxParticipants: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

/**
 * Event category entity.
 */
export interface EventCategoryEntity {
  id: string;
  eventId: string;
  tenantId: string;
  name: string;
  description: string | null;
  gender: SafeCategoryGender | null;
  minAge: number | null;
  maxAge: number | null;
  minWeight: number | null;
  maxWeight: number | null;
  beltMinId: string | null;
  beltMaxId: string | null;
  maxParticipants: number | null;
  priceCents: number | null;
  currency: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Event bracket entity.
 */
export interface EventBracketEntity {
  id: string;
  eventId: string;
  categoryId: string;
  tenantId: string;
  status: SafeBracketStatus;
  version: number;
  generatedAt: string;
  generatedBy: string | null;
  publishedAt: string | null;
  notes: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Event registration entity.
 */
export interface EventRegistrationEntity {
  id: string;
  eventId: string;
  categoryId: string;
  athleteId: string;
  tenantId: string;
  status: SafeRegistrationStatus;
  paymentStatus: string;
  registeredBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Bracket match entity.
 */
export interface BracketMatchEntity {
  id: string;
  bracketId: string;
  categoryId: string;
  tenantId: string;
  round: number;
  position: number;
  athlete1RegistrationId: string | null;
  athlete2RegistrationId: string | null;
  winnerRegistrationId: string | null;
  status: string;
  completedAt: string | null;
  recordedBy: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Event form data (for create/edit).
 */
export interface EventFormData {
  name: string;
  description: string;
  eventDate: string;
  eventEndDate: string;
  location: string;
  isPublic: boolean;
  registrationOpensAt: string;
  registrationClosesAt: string;
  maxParticipants: number | null;
}

/**
 * Category form data.
 */
export interface CategoryFormData {
  name: string;
  description: string;
  gender: SafeCategoryGender | null;
  minAge: number | null;
  maxAge: number | null;
  minWeight: number | null;
  maxWeight: number | null;
  maxParticipants: number | null;
  priceCents: number | null;
}

/**
 * Event view state for UI rendering.
 */
export type EventViewState = 
  | 'LOADING'
  | 'READY'
  | 'EMPTY'
  | 'ERROR'
  | 'NOT_FOUND';

/**
 * Event action permissions.
 */
export interface EventPermissions {
  canEdit: boolean;
  canPublish: boolean;
  canCancel: boolean;
  canArchive: boolean;
  canManageCategories: boolean;
  canManageBrackets: boolean;
  canManageRegistrations: boolean;
}
