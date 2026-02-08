/**
 * 🔐 AUDIT2.0 — SAFE GOLD Types
 * 
 * Canonical enums and types for deterministic audit logging.
 * All audit entries MUST conform to these types.
 * 
 * FROZEN: Do not modify without constitutional review.
 */

// ============================================================
// SAFE GOLD ENUMS — CLOSED & IMMUTABLE
// ============================================================

export const SAFE_AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'IMPERSONATE',
  'EXPORT',
  'IMPORT',
  'BILLING_CHANGE',
  'ROLE_ASSIGN',
  'ROLE_REVOKE',
  'APPROVE',
  'REJECT',
  'CANCEL',
  'EXPIRE',
  'RENEW',
] as const;

export type SafeAuditAction = typeof SAFE_AUDIT_ACTIONS[number];

export const SAFE_AUDIT_ENTITIES = [
  'USER',
  'TENANT',
  'MEMBERSHIP',
  'EVENT',
  'BILLING',
  'EXPORT',
  'ANALYTICS',
  'SYSTEM',
  'ATHLETE',
  'COACH',
  'ACADEMY',
  'DIPLOMA',
  'GRADING',
  'ROLE',
] as const;

export type SafeAuditEntity = typeof SAFE_AUDIT_ENTITIES[number];

export const SAFE_AUDIT_LEVELS = [
  'INFO',
  'WARNING',
  'CRITICAL',
] as const;

export type SafeAuditLevel = typeof SAFE_AUDIT_LEVELS[number];

export const SAFE_AUDIT_VIEW_STATES = [
  'OK',
  'EMPTY',
  'LOADING',
  'ERROR',
] as const;

export type SafeAuditViewState = typeof SAFE_AUDIT_VIEW_STATES[number];

// ============================================================
// AUDIT ENTRY TYPES
// ============================================================

export interface AuditEntryInput {
  tenant_id: string;
  actor_id: string;
  action: SafeAuditAction;
  entity: SafeAuditEntity;
  entity_id?: string | null;
  level: SafeAuditLevel;
  occurred_at: string; // ISO 8601 — MUST be provided externally
  metadata: Record<string, unknown>;
}

export interface NormalizedAuditEntry extends AuditEntryInput {
  metadata: Record<string, unknown>; // Keys sorted deterministically
}

export interface AuditLogRecord extends NormalizedAuditEntry {
  id: string;
  hash: string;
  created_at: string;
}

// ============================================================
// PROTECTED TABLES — READ-ONLY DURING AUDIT READS
// ============================================================

export const AUDIT_PROTECTED_TABLES = [
  'tenants',
  'profiles',
  'user_roles',
  'athletes',
  'memberships',
  'events',
  'event_brackets',
  'tenant_billing',
  'diplomas',
  'coaches',
  'academies',
] as const;

// ============================================================
// TYPE GUARDS
// ============================================================

export function isValidAuditAction(value: unknown): value is SafeAuditAction {
  return typeof value === 'string' && SAFE_AUDIT_ACTIONS.includes(value as SafeAuditAction);
}

export function isValidAuditEntity(value: unknown): value is SafeAuditEntity {
  return typeof value === 'string' && SAFE_AUDIT_ENTITIES.includes(value as SafeAuditEntity);
}

export function isValidAuditLevel(value: unknown): value is SafeAuditLevel {
  return typeof value === 'string' && SAFE_AUDIT_LEVELS.includes(value as SafeAuditLevel);
}

export function isValidAuditViewState(value: unknown): value is SafeAuditViewState {
  return typeof value === 'string' && SAFE_AUDIT_VIEW_STATES.includes(value as SafeAuditViewState);
}
