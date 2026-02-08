/**
 * Shared Audit Logger Utility
 * 
 * Centralized function to create consistent audit log entries across all edge functions.
 * This ensures all critical business events are logged with a standardized format.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
  if (eventType.startsWith('LOGIN_') || eventType.startsWith('PASSWORD_')) return 'AUTH';
  if (eventType.startsWith('ROLES_')) return 'ROLES';
  if (eventType.startsWith('TMP_') || eventType.startsWith('DIGITAL_')) return 'STORAGE';
  return 'OTHER';
}

/**
 * Standard metadata fields that should be included when applicable.
 * Not all fields are required for every event - include what's relevant.
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
  try {
    // Auto-detect category if not provided
    const category = entry.metadata?.category || detectCategory(entry.event_type);
    
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
      console.error('[AUDIT-LOGGER] Failed to create audit log:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[AUDIT-LOGGER] Exception creating audit log:', errorMessage);
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
