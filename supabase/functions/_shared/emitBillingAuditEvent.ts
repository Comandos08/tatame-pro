/**
 * emitBillingAuditEvent — Billing-Aware Audit Trail
 * 
 * P3.5 — Domain-Level Governance
 * 
 * CONTRACT:
 * - Every sensitive mutation generates an audit event
 * - Both ALLOWED and BLOCKED decisions are logged
 * - Domain is explicit (EVENTS, MEMBERSHIPS, RANKINGS, GRADINGS)
 * - Billing status is captured at decision time
 * - BEST-EFFORT: Audit failures do NOT break the main flow
 * 
 * This is a WRITE operation but is isolated from the main business logic.
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 */

import { createBackendLogger } from "./backend-logger.ts";
import { sanitizeAuditMetadata } from "./security/sanitizeAuditMetadata.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/**
 * Domain types for billing-aware operations
 */
export type AuditDomain = 'EVENTS' | 'MEMBERSHIPS' | 'RANKINGS' | 'GRADINGS' | 'ACADEMIES' | 'COACHES' | 'ATHLETES' | 'WIZARD';

/**
 * Decision outcomes for billing gate
 */
export type AuditDecision = 'ALLOWED' | 'BLOCKED';

/**
 * Event types for billing-aware audit
 */
export type BillingAuditEventType = 
  | 'BILLING_WRITE_ALLOWED'
  | 'BILLING_WRITE_BLOCKED'
  | 'TENANT_NOT_ACTIVE_BLOCK'
  | 'BILLING_READ_ONLY_BLOCK'
  | 'BILLING_BLOCKED'
  | 'WIZARD_ADMIN_ASSIGN_FAILED';

/**
 * Payload for billing-aware audit events
 */
export interface BillingAwareAuditEvent {
  event_type: BillingAuditEventType;
  tenant_id: string;
  profile_id: string | null;
  domain: AuditDomain;
  operation: string;
  decision: AuditDecision;
  tenant_status: string | null;
  billing_status: string | null;
  billing_block_reason?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Emit a billing-aware audit event.
 * 
 * BEST-EFFORT: This function catches all errors internally.
 * Audit failures do NOT propagate to the caller.
 * 
 * @param supabase - Service role Supabase client
 * @param payload - The audit event payload
 */
export async function emitBillingAuditEvent(
  supabase: SupabaseClient,
  payload: BillingAwareAuditEvent
): Promise<void> {
  const log = createBackendLogger("emitBillingAuditEvent", crypto.randomUUID());
  log.setTenant(payload.tenant_id);

  try {
    // P1.3 — LGPD: mask PII in metadata before insert. Only the freeform
    // `payload.metadata` can contain arbitrary keys from callers; the
    // billing-scoped fields above are well-known non-PII enums/strings.
    const sanitizedExtras = sanitizeAuditMetadata(
      (payload.metadata ?? {}) as Record<string, unknown>,
    );

    const { error } = await supabase
      .from('audit_logs')
      .insert({
        event_type: payload.event_type,
        tenant_id: payload.tenant_id,
        profile_id: payload.profile_id,
        metadata: {
          domain: payload.domain,
          operation: payload.operation,
          decision: payload.decision,
          tenant_status: payload.tenant_status,
          billing_status: payload.billing_status,
          billing_block_reason: payload.billing_block_reason ?? null,
          ...sanitizedExtras,
        },
      });

    if (error) {
      log.error('Failed to insert audit log', error);
      // Do NOT throw - audit is best-effort
    } else {
      log.info(`${payload.event_type} logged for ${payload.domain}:${payload.operation}`);
    }
  } catch (err) {
    // BEST-EFFORT: Swallow all errors
    log.error('Unexpected error', err);
  }
}