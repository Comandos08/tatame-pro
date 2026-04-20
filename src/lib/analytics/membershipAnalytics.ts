/**
 * R-01 — Deterministic Funnel Instrumentation (Membership Flow)
 *
 * Pure structured logging for membership funnel analytics.
 * No external dependencies. No network calls. No console.*.
 * Events logged via institutional logger only.
 */

import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

/** Strict union of allowed membership funnel events */
export type MembershipEventName =
  | 'MEMBERSHIP_TYPE_VIEWED'
  | 'MEMBERSHIP_TYPE_SELECTED'
  | 'MEMBERSHIP_FORM_STARTED'
  | 'MEMBERSHIP_STEP_COMPLETED'
  | 'MEMBERSHIP_PAYMENT_INITIATED'
  | 'MEMBERSHIP_SUCCESS_PAGE_LOADED'
  | 'MEMBERSHIP_SUCCESS_VIEWED'
  | 'MEMBERSHIP_APPROVED'
  | 'MEMBERSHIP_PORTAL_ACCESSED';

/** Structured payload for membership analytics events */
export interface MembershipEventPayload {
  tenantSlug: string;
  membershipType?: 'adult' | 'youth';
  step?: number;
  /** Optional — defaults to Date.now() inside logMembershipEvent. Callers
   * should omit unless they need a specific upstream timestamp; calling
   * Date.now() at a component render site triggers React Compiler purity. */
  timestamp?: number;
}

/**
 * Emit a structured membership analytics event via the institutional logger.
 *
 * - Pure structured logging (logger.info)
 * - No side effects, no network calls
 * - Deterministic: same input → same output
 */
export function logMembershipEvent(
  eventName: MembershipEventName,
  payload: MembershipEventPayload
): void {
  // Default timestamp inside this pure analytics function so component-side
  // callers don't have to call Date.now() during render.
  const resolved = { ...payload, timestamp: payload.timestamp ?? Date.now() };
  logger.info(`[ANALYTICS] ${eventName}`, {
    event: eventName,
    ...resolved,
  });

  // R-01C: Fire-and-forget DB persistence — never blocks, never throws
  supabase
    .from('membership_analytics')
    .insert({
      tenant_slug: payload.tenantSlug,
      event_name: eventName,
      membership_type: payload.membershipType ?? null,
      step: payload.step ?? null,
    })
    .then(null, () => {
      // fail-silent
    });
}
