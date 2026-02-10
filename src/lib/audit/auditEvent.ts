/**
 * PI B3 — Canonical Frontend Audit Helper
 *
 * Single entry point for frontend audit logging.
 * Resolves impersonation context automatically.
 * BEST-EFFORT: never throws, never blocks UI.
 *
 * Usage:
 *   await auditEvent({
 *     event_type: 'TENANT_SETTINGS_UPDATED',
 *     tenant_id: tenant.id,
 *     profile_id: currentUser.id,
 *     target_type: 'TENANT',
 *     target_id: tenant.id,
 *     metadata: { changes: { ... } },
 *   });
 */

import { supabase } from '@/integrations/supabase/client';
import { auditLogger } from '@/lib/observability/logger';

/** Canonical audit categories (mirrors backend detectCategory) */
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
  | 'OBSERVABILITY'
  | 'OTHER';

export interface AuditEventInput {
  event_type: string;
  tenant_id: string | null;
  profile_id: string | null;
  /** Target entity type (e.g. ATHLETE, BADGE, TENANT) */
  target_type?: string;
  /** Target entity ID */
  target_id?: string;
  /** Effective role if known */
  effective_role?: string;
  /** Impersonation context — pass from ImpersonationContext if available */
  impersonation?: {
    impersonationId: string;
    /** The real superadmin user ID (should match profile_id) */
  } | null;
  /** Additional metadata (no PII, no secrets) */
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'tatame_impersonation_session';

/**
 * Detect category from event_type prefix.
 * Mirrors backend `_shared/audit-logger.ts → detectCategory()`.
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
  if (eventType.startsWith('FEDERATION_') || eventType.startsWith('TENANT_JOINED_') || eventType.startsWith('TENANT_LEFT_')) return 'FEDERATION';
  if (eventType.startsWith('COUNCIL_')) return 'COUNCIL';
  if (eventType.startsWith('HEALTH_')) return 'OBSERVABILITY';
  if (eventType.startsWith('BADGE_')) return 'OTHER';
  return 'OTHER';
}

/**
 * Resolve impersonation state from sessionStorage (lightweight, no context dependency).
 * This allows auditEvent to be called outside React component tree.
 */
function resolveImpersonation(): { impersonated: boolean; impersonation_id?: string } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { impersonated: false };
    const session = JSON.parse(raw);
    if (session?.status === 'ACTIVE' && session?.impersonationId) {
      return { impersonated: true, impersonation_id: session.impersonationId };
    }
    return { impersonated: false };
  } catch {
    return { impersonated: false };
  }
}

/**
 * Emit a single audit event. Best-effort — never throws.
 */
export async function auditEvent(input: AuditEventInput): Promise<void> {
  try {
    const category = detectCategory(input.event_type);
    
    // Resolve impersonation: explicit param takes priority, else sessionStorage
    const imp = input.impersonation
      ? { impersonated: true, impersonation_id: input.impersonation.impersonationId }
      : resolveImpersonation();

    const metadata: Record<string, unknown> = {
      category,
      occurred_at: new Date().toISOString(),
      ...imp,
      ...(input.effective_role && { effective_role: input.effective_role }),
      ...(input.target_type && { target_type: input.target_type }),
      ...(input.target_id && { target_id: input.target_id }),
      ...input.metadata,
    };

    const { error } = await (supabase.from('audit_logs') as any).insert({
      event_type: input.event_type,
      tenant_id: input.tenant_id,
      profile_id: input.profile_id,
      category,
      metadata,
    });

    if (error) {
      auditLogger.error('Audit insert failed', { component: 'AuditEvent', action: 'insert', metadata: { error: error.message } } as any);
    }
  } catch (err) {
    // Best-effort — never block UI
    auditLogger.error('Audit exception', { component: 'AuditEvent', action: 'insert' } as any, err instanceof Error ? err : new Error(String(err)));
  }
}
