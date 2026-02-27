/**
 * Shared Audit Logger Utility
 * 
 * Centralized function to create consistent audit log entries across all edge functions.
 * This ensures all critical business events are logged with a standardized format.
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "./backend-logger.ts";

/**
 * Standard audit event types for the TATAME platform.
 * All edge functions should use these constants to ensure consistency.
 */
export const AUDIT_EVENTS = {
  // Membership events
  MEMBERSHIP_CREATED: 'MEMBERSHIP_CREATED',
  MEMBERSHIP_UPDATED: 'MEMBERSHIP_UPDATED',
  MEMBERSHIP_PAID: 'MEMBERSHIP_PAID',
  MEMBERSHIP_APPROVED: 'MEMBERSHIP_APPROVED',
  MEMBERSHIP_REJECTED: 'MEMBERSHIP_REJECTED',
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  MEMBERSHIP_CANCELLED: 'MEMBERSHIP_CANCELLED',
  MEMBERSHIP_PENDING_PAYMENT_CLEANUP: 'MEMBERSHIP_PENDING_PAYMENT_CLEANUP',
  MEMBERSHIP_ABANDONED_CLEANUP: 'MEMBERSHIP_ABANDONED_CLEANUP',
  MEMBERSHIP_EXPIRING_NOTIFIED: 'MEMBERSHIP_EXPIRING_NOTIFIED',
  MEMBERSHIP_PAYMENT_RETRY: 'MEMBERSHIP_PAYMENT_RETRY',
  MEMBERSHIP_PAYMENT_RETRY_FAILED: 'MEMBERSHIP_PAYMENT_RETRY_FAILED',
  MEMBERSHIP_FEE_PAID: 'MEMBERSHIP_FEE_PAID',
  MEMBERSHIP_MANUAL_CANCELLED: 'MEMBERSHIP_MANUAL_CANCELLED',
  MEMBERSHIP_MANUAL_REACTIVATED: 'MEMBERSHIP_MANUAL_REACTIVATED',
  
  // Role events (CRITICAL - tracks all permission grants)
  ROLES_GRANTED: 'ROLES_GRANTED',
  ROLES_REVOKED: 'ROLES_REVOKED',
  
  // Renewal events
  RENEWAL_REMINDER_SENT: 'RENEWAL_REMINDER_SENT',
  
  // Diploma and grading events
  DIPLOMA_ISSUED: 'DIPLOMA_ISSUED',
  DIPLOMA_REVOKED: 'DIPLOMA_REVOKED',
  GRADING_RECORDED: 'GRADING_RECORDED',
  GRADING_NOTIFICATION_SENT: 'GRADING_NOTIFICATION_SENT',
  
  // Billing events
  TENANT_BILLING_UPDATED: 'TENANT_BILLING_UPDATED',
  TENANT_SUBSCRIPTION_CREATED: 'TENANT_SUBSCRIPTION_CREATED',
  TENANT_SUBSCRIPTION_CANCELLED: 'TENANT_SUBSCRIPTION_CANCELLED',
  TENANT_PAYMENT_SUCCEEDED: 'TENANT_PAYMENT_SUCCEEDED',
  TENANT_PAYMENT_FAILED: 'TENANT_PAYMENT_FAILED',
  TRIAL_END_NOTIFICATION_SENT: 'TRIAL_END_NOTIFICATION_SENT',
  
  // Billing environment governance (PI-BILL-ENV-001)
  BILLING_ENV_MISMATCH_BLOCKED: 'BILLING_ENV_MISMATCH_BLOCKED',
  BILLING_KEY_UNKNOWN_BLOCKED: 'BILLING_KEY_UNKNOWN_BLOCKED',
  BILLING_CONFIG_MISSING_BLOCKED: 'BILLING_CONFIG_MISSING_BLOCKED',
  BILLING_PRICE_NOT_CONFIGURED_BLOCKED: 'BILLING_PRICE_NOT_CONFIGURED_BLOCKED',
  BILLING_STRIPE_PRICE_LOOKUP_FAILED: 'BILLING_STRIPE_PRICE_LOOKUP_FAILED',
  BILLING_ENV_VALIDATED: 'BILLING_ENV_VALIDATED',
  
  // PI-BILL-HARD-001 — Unexpected error normalization
  BILLING_UNEXPECTED_ERROR: 'BILLING_UNEXPECTED_ERROR',
  
  // A03 — Billing State Machine
  BILLING_TRANSITION_BLOCKED: 'BILLING_TRANSITION_BLOCKED',
  
  // A04 — Tenant Boundary Enforcement
  TENANT_BOUNDARY_VIOLATION: 'TENANT_BOUNDARY_VIOLATION',
  
  // PI-BILL-HARD-002 — Billing not provisioned (valid domain state)
  BILLING_NOT_PROVISIONED: 'BILLING_NOT_PROVISIONED',
  
  // Auth events
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  
  // Settings events
  TENANT_SETTINGS_UPDATED: 'TENANT_SETTINGS_UPDATED',
  
  // Card events
  DIGITAL_CARD_GENERATED: 'DIGITAL_CARD_GENERATED',
  
  // Storage cleanup events
  TMP_DOCUMENT_CLEANED: 'TMP_DOCUMENT_CLEANED',
  TMP_DOCUMENT_CLEANUP_RUN: 'TMP_DOCUMENT_CLEANUP_RUN',
  
  // Impersonation events
  IMPERSONATION_STARTED: 'IMPERSONATION_STARTED',
  IMPERSONATION_ENDED: 'IMPERSONATION_ENDED',
  IMPERSONATION_EXPIRED: 'IMPERSONATION_EXPIRED',
  IMPERSONATION_REVOKED: 'IMPERSONATION_REVOKED',
  
  // Job execution events (runs even when no items processed)
  JOB_EXPIRE_MEMBERSHIPS_RUN: 'JOB_EXPIRE_MEMBERSHIPS_RUN',
  JOB_CLEANUP_ABANDONED_RUN: 'JOB_CLEANUP_ABANDONED_RUN',
  JOB_CHECK_TRIALS_RUN: 'JOB_CHECK_TRIALS_RUN',
  JOB_EXPIRE_TRIALS_RUN: 'JOB_EXPIRE_TRIALS_RUN',
  JOB_PENDING_DELETE_RUN: 'JOB_PENDING_DELETE_RUN',
  JOB_PRE_EXPIRATION_RUN: 'JOB_PRE_EXPIRATION_RUN',
  JOB_YOUTH_TRANSITION_RUN: 'JOB_YOUTH_TRANSITION_RUN',
  JOB_PENDING_PAYMENT_GC_RUN: 'JOB_PENDING_PAYMENT_GC_RUN',
  
  // PI-D4-AUDIT1.0: Minimal Audit Events (CLOSED LIST)
  TENANT_CREATED: 'TENANT_CREATED',
  TENANT_STATUS_CHANGED: 'TENANT_STATUS_CHANGED',
  BILLING_STATUS_CHANGED: 'BILLING_STATUS_CHANGED',
  DOCUMENT_ISSUED: 'DOCUMENT_ISSUED',
  DOCUMENT_REVOKED: 'DOCUMENT_REVOKED',
  DOCUMENT_VERIFIED_PUBLIC: 'DOCUMENT_VERIFIED_PUBLIC',
  SUPERADMIN_ACTION: 'SUPERADMIN_ACTION',
  
  // PI-D5-FEDERATION1.0: Federation Audit Events
  // ⚠️ CRITICAL (PI-D5.A): All federation events MUST include metadata.federation_id
  FEDERATION_CREATED: 'FEDERATION_CREATED',
  FEDERATION_STATUS_CHANGED: 'FEDERATION_STATUS_CHANGED',
  TENANT_JOINED_FEDERATION: 'TENANT_JOINED_FEDERATION',
  TENANT_LEFT_FEDERATION: 'TENANT_LEFT_FEDERATION',
  FEDERATION_ROLE_ASSIGNED: 'FEDERATION_ROLE_ASSIGNED',
  FEDERATION_ROLE_REVOKED: 'FEDERATION_ROLE_REVOKED',
  
  // PI-D5-COUNCIL1.0: Council Audit Events
  // ⚠️ CRITICAL (PI-D5.A): All council events MUST include metadata.federation_id AND metadata.council_id
  COUNCIL_CREATED: 'COUNCIL_CREATED',
  COUNCIL_MEMBER_ADDED: 'COUNCIL_MEMBER_ADDED',
  COUNCIL_MEMBER_REMOVED: 'COUNCIL_MEMBER_REMOVED',
  COUNCIL_DECISION_CREATED: 'COUNCIL_DECISION_CREATED',
  COUNCIL_DECISION_APPROVED: 'COUNCIL_DECISION_APPROVED',
  COUNCIL_DECISION_REJECTED: 'COUNCIL_DECISION_REJECTED',
  
  // Youth transition events
  YOUTH_AUTO_TRANSITION: 'YOUTH_AUTO_TRANSITION',
} as const;

export type AuditEventType = typeof AUDIT_EVENTS[keyof typeof AUDIT_EVENTS];

/**
 * Event categories for filtering and observability.
 * Auto-detected based on event_type prefix.
 */
export type AuditCategory = 
  | 'MEMBERSHIP' 
  | 'BILLING' 
  | 'JOB' 
  | 'GRADING' 
  | 'SECURITY' 
  | 'AUTH' 
  | 'ROLES' 
  | 'STORAGE'
  | 'FEDERATION'
  | 'COUNCIL'
  | 'OTHER';

/**
 * Detect category from event type prefix.
 */
function detectCategory(eventType: string): AuditCategory {
  if (eventType.startsWith('MEMBERSHIP_')) return 'MEMBERSHIP';
  if (eventType.startsWith('TENANT_') || eventType.startsWith('BILLING_')) return 'BILLING';
  if (eventType.startsWith('JOB_')) return 'JOB';
  if (eventType.startsWith('DIPLOMA_') || eventType.startsWith('GRADING_')) return 'GRADING';
  if (eventType.startsWith('IMPERSONATION_')) return 'SECURITY';
  if (eventType.startsWith('TENANT_BOUNDARY_')) return 'SECURITY';
  if (eventType.startsWith('LOGIN_') || eventType.startsWith('PASSWORD_')) return 'AUTH';
  if (eventType.startsWith('ROLES_')) return 'ROLES';
  if (eventType.startsWith('TMP_') || eventType.startsWith('DIGITAL_')) return 'STORAGE';
  if (eventType.startsWith('FEDERATION_') || eventType.startsWith('TENANT_JOINED_') || eventType.startsWith('TENANT_LEFT_')) return 'FEDERATION';
  if (eventType.startsWith('COUNCIL_')) return 'COUNCIL';
  return 'OTHER';
}

/**
 * Standard metadata fields that should be included when applicable.
 * Not all fields are required for every event - include what's relevant.
 * 
 * ⚠️ PI-D5.A MANDATORY FIELDS:
 *   - FEDERATION_* events: MUST include federation_id
 *   - COUNCIL_* events: MUST include federation_id AND council_id
 *   - TENANT_JOINED/LEFT_FEDERATION: MUST include federation_id
 */
export interface AuditMetadata {
  // Entity IDs (include when applicable)
  membership_id?: string;
  athlete_id?: string;
  academy_id?: string;
  coach_id?: string;
  diploma_id?: string;
  grading_id?: string;
  invoice_id?: string;
  
  // Federation/Council IDs (PI-D5.A - MANDATORY for federative events)
  federation_id?: string;
  council_id?: string;
  
  // Actor information
  actor_profile_id?: string;
  actor_email?: string;
  
  // Event-specific data
  previous_status?: string;
  new_status?: string;
  amount_cents?: number;
  currency?: string;
  
  // Automation flags
  automatic?: boolean;
  scheduled?: boolean;
  
  // Error information
  error?: string;
  error_code?: string;
  
  // Additional context
  reason?: string;
  source?: string;
  ip_address?: string;
  
  // Impersonation context
  impersonation_id?: string;
  superadmin_user_id?: string;
  target_tenant_name?: string;
  target_tenant_slug?: string;
  expires_at?: string;
  started_at?: string;
  ended_at?: string;
  expired_at?: string;
  
  // Job execution (P4.1)
  status?: 'COMPLETED' | 'FAILED';
  processed?: number;
  duration_ms?: number;
  
  // Category (auto-detected if not provided)
  category?: AuditCategory;
  
  // Timestamps
  occurred_at?: string;
  
  // Freeform extra data
  [key: string]: unknown;
}

export interface AuditLogEntry {
  event_type: AuditEventType | string;
  tenant_id: string | null;
  profile_id?: string | null;
  metadata?: AuditMetadata;
}

/**
 * Create an audit log entry with consistent formatting.
 * 
 * @param supabase - Supabase client instance (must use service role for edge functions)
 * @param entry - The audit log entry to create
 * @returns Promise that resolves when the log is created
 * 
 * @example
 * await createAuditLog(supabase, {
 *   event_type: AUDIT_EVENTS.MEMBERSHIP_PAID,
 *   tenant_id: membership.tenant_id,
 *   metadata: {
 *     membership_id: membership.id,
 *     athlete_id: membership.athlete_id,
 *     amount_cents: membership.price_cents,
 *     automatic: false,
 *   }
 * });
 */
export async function createAuditLog(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  entry: AuditLogEntry
): Promise<{ success: boolean; error?: string }> {
  const log = createBackendLogger("audit-logger", crypto.randomUUID());
  log.setTenant(entry.tenant_id);

  try {
    // Auto-detect category if not provided
    const category = entry.metadata?.category || detectCategory(entry.event_type);
    
    // PI-D5.A: Validate mandatory federation_id for federative events
    const isFederationEvent = entry.event_type.startsWith('FEDERATION_') || 
                               entry.event_type.startsWith('TENANT_JOINED_') ||
                               entry.event_type.startsWith('TENANT_LEFT_');
    const isCouncilEvent = entry.event_type.startsWith('COUNCIL_');
    
    if (isFederationEvent && !entry.metadata?.federation_id) {
      log.error(`PI-D5.A VIOLATION: ${entry.event_type} requires metadata.federation_id`);
      return { success: false, error: `PI-D5.A: ${entry.event_type} requires metadata.federation_id` };
    }
    
    if (isCouncilEvent && (!entry.metadata?.federation_id || !entry.metadata?.council_id)) {
      log.error(`PI-D5.A VIOLATION: ${entry.event_type} requires metadata.federation_id AND metadata.council_id`);
      return { success: false, error: `PI-D5.A: ${entry.event_type} requires metadata.federation_id AND metadata.council_id` };
    }
    
    // Ensure metadata includes a timestamp if not provided
    const metadata: AuditMetadata = {
      ...entry.metadata,
      category,
      occurred_at: entry.metadata?.occurred_at || new Date().toISOString(),
    };

    const { error } = await supabase.from('audit_logs').insert({
      event_type: entry.event_type,
      tenant_id: entry.tenant_id,
      profile_id: entry.profile_id || null,
      metadata,
      category, // Also set at column level for indexed queries
    });

    if (error) {
      log.error('Failed to create audit log', error, { event_type: entry.event_type });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    log.error('Exception creating audit log', err, { event_type: entry.event_type });
    return { success: false, error: errorMessage };
  }
}

/**
 * Create multiple audit log entries in a batch.
 * Useful for operations that affect multiple entities.
 */
export async function createAuditLogBatch(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  entries: AuditLogEntry[]
): Promise<{ success: boolean; created: number; failed: number }> {
  const results = await Promise.all(
    entries.map(entry => createAuditLog(supabase, entry))
  );

  return {
    success: results.every(r => r.success),
    created: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  };
}
