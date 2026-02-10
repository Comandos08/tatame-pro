// ============================================================================
// PI U16 — INSTITUTIONAL TIMELINE (Canonical Model)
// ============================================================================
//
// Append-only event model for institutional auditing.
// NO React. NO hooks. NO side-effects. Pure types.
//
// Persisted in: public.institutional_events (service_role INSERT only)
// Read by: SUPERADMIN_GLOBAL only
// ============================================================================

export type InstitutionalEventDomain =
  | 'AUTH'
  | 'IDENTITY'
  | 'BILLING'
  | 'SECURITY'
  | 'GOVERNANCE'
  | 'SYSTEM'
  | 'FEATURE_FLAG';

export type InstitutionalEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'IDENTITY_RESOLVED'
  | 'BILLING_STATUS_CHANGED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'TENANT_LIFECYCLE_CHANGED'
  | 'SECURITY_BLOCK_APPLIED'
  | 'SECURITY_BLOCK_LIFTED'
  | 'SYSTEM_LIMIT_REACHED'
  | 'FLAG_UPDATED';

export interface InstitutionalEvent {
  id: string;
  occurredAt: string; // ISO 8601
  domain: InstitutionalEventDomain;
  type: InstitutionalEventType;
  tenantId?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}
