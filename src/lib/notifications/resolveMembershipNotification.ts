/**
 * NOTIFICATION ENGINE — Pure Decision Layer
 * 
 * This module contains ZERO side effects:
 * - No email sending
 * - No database access
 * - No logging
 * - No external API calls
 * 
 * It is a pure, deterministic function that decides:
 * 1. Whether to send an email
 * 2. Which template to use
 * 3. What payload to include
 * 
 * SOURCE OF TRUTH: Canonical email notification document
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Valid membership statuses in the system.
 * These match exactly the PortalAccessGate states.
 */
export type MembershipStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REJECTED';

/**
 * Special states that are NOT membership statuses but affect notification logic.
 * These are handled externally and never trigger notifications from this engine.
 */
export type SpecialState = 'NO_ATHLETE' | 'ERROR';

/**
 * All valid template IDs in the notification system.
 * Each maps to a specific email template with defined content.
 */
export type NotificationTemplateId =
  | 'membership_approved'
  | 'membership_rejected'
  | 'membership_expired'
  | 'membership_cancelled'
  | 'membership_renewed';

/**
 * Supported locales for email content.
 */
export type SupportedLocale = 'pt-BR' | 'en';

/**
 * Decision result when NO email should be sent.
 */
export interface NoNotificationDecision {
  shouldSendEmail: false;
}

/**
 * Decision result when an email SHOULD be sent.
 */
export interface SendNotificationDecision {
  shouldSendEmail: true;
  templateId: NotificationTemplateId;
  ctaUrl: string;
  locale: SupportedLocale;
  payload: NotificationPayload;
}

/**
 * Union type for all possible notification decisions.
 */
export type NotificationDecision = NoNotificationDecision | SendNotificationDecision;

/**
 * Payload structure for each template type.
 * Using discriminated union for type safety.
 */
export type NotificationPayload =
  | ApprovedPayload
  | RejectedPayload
  | ExpiredPayload
  | CancelledPayload
  | RenewedPayload;

export interface ApprovedPayload {
  templateId: 'membership_approved';
  athleteName: string;
  tenantName: string;
  portalUrl: string;
}

export interface RejectedPayload {
  templateId: 'membership_rejected';
  athleteName: string;
  tenantName: string;
  rejectionReason: string;
}

export interface ExpiredPayload {
  templateId: 'membership_expired';
  athleteName: string;
  tenantName: string;
  expirationDate: string;
  renewUrl: string;
}

export interface CancelledPayload {
  templateId: 'membership_cancelled';
  athleteName: string;
  tenantName: string;
}

export interface RenewedPayload {
  templateId: 'membership_renewed';
  athleteName: string;
  tenantName: string;
  newExpirationDate: string;
  portalUrl: string;
}

/**
 * Input structure for the notification resolver.
 */
export interface NotificationInput {
  /** Previous status (null for new memberships) */
  previousStatus: MembershipStatus | null;
  /** New/current status */
  newStatus: MembershipStatus;
  /** Flag to indicate renewal was just confirmed */
  isRenewalConfirmation?: boolean;
  /** Membership data */
  membership: {
    id: string;
    endDate?: string;
    rejectionReason?: string;
  };
  /** Athlete data */
  athlete: {
    fullName: string;
    email: string;
    preferredLocale?: SupportedLocale;
  };
  /** Tenant data */
  tenant: {
    name: string;
    slug: string;
    defaultLocale: SupportedLocale;
  };
  /** Base URL for CTA links */
  baseUrl: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * CTA URL paths by template.
 * These are relative paths that will be prefixed with baseUrl and tenantSlug.
 */
const CTA_PATHS: Record<NotificationTemplateId, string> = {
  membership_approved: '/portal',
  membership_rejected: '/membership/new',
  membership_expired: '/membership/renew',
  membership_cancelled: '/membership/new',
  membership_renewed: '/portal',
} as const;

// ============================================================================
// HELPER FUNCTIONS (Pure)
// ============================================================================

/**
 * Resolves the locale to use for the notification.
 * Priority: athlete preference > tenant default
 */
function resolveLocale(input: NotificationInput): SupportedLocale {
  return input.athlete.preferredLocale ?? input.tenant.defaultLocale;
}

/**
 * Builds the full CTA URL from components.
 */
function buildCtaUrl(baseUrl: string, tenantSlug: string, path: string): string {
  // Normalize baseUrl (remove trailing slash)
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return `${normalizedBase}/${tenantSlug}${path}`;
}

/**
 * Checks if this is a same-status transition (no-op).
 * RULE: Never send email when status doesn't change.
 */
function isSameStatusTransition(prev: MembershipStatus | null, next: MembershipStatus): boolean {
  return prev === next;
}

/**
 * Checks if the new status is a terminal error state.
 * RULE: Never send email for ERROR state.
 */
function isErrorState(status: MembershipStatus | SpecialState): boolean {
  return status === 'ERROR' || status === 'NO_ATHLETE';
}

// ============================================================================
// MAIN RESOLVER FUNCTION
// ============================================================================

/**
 * Pure function that decides whether to send a notification and what content.
 * 
 * DECISION RULES (in order of evaluation):
 * 
 * 1. NEVER send if previousStatus === newStatus (no change)
 * 2. NEVER send for ERROR or NO_ATHLETE states
 * 3. NEVER send for DRAFT → PENDING_REVIEW (initial submission)
 * 4. NEVER send for PENDING_PAYMENT transitions
 * 5. SEND for PENDING_REVIEW → APPROVED (approval)
 * 6. SEND for PENDING_REVIEW → REJECTED (rejection)
 * 7. SEND for ACTIVE → EXPIRED (expiration)
 * 8. SEND for ACTIVE → CANCELLED (cancellation)
 * 9. SEND for APPROVED → CANCELLED (cancellation)
 * 10. SEND for renewal confirmation (external flag)
 * 11. DEFAULT: Don't send for any unlisted transition
 * 
 * @param input - All data needed to make the decision
 * @returns NotificationDecision - Either { shouldSendEmail: false } or full notification config
 */
export function resolveMembershipNotification(input: NotificationInput): NotificationDecision {
  const { previousStatus, newStatus, isRenewalConfirmation, membership, athlete, tenant, baseUrl } = input;

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 1: No email for same-status transitions
  // ─────────────────────────────────────────────────────────────────────────
  if (isSameStatusTransition(previousStatus, newStatus)) {
    return { shouldSendEmail: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 2: No email for DRAFT → PENDING_REVIEW (initial submission)
  // Athlete already knows they submitted - no email needed
  // ─────────────────────────────────────────────────────────────────────────
  if (previousStatus === 'DRAFT' && newStatus === 'PENDING_REVIEW') {
    return { shouldSendEmail: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 3: No email for PENDING_PAYMENT transitions
  // Payment system handles its own notifications
  // ─────────────────────────────────────────────────────────────────────────
  if (previousStatus === 'PENDING_PAYMENT' || newStatus === 'PENDING_PAYMENT') {
    return { shouldSendEmail: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shared values for all notification types
  // ─────────────────────────────────────────────────────────────────────────
  const locale = resolveLocale(input);

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 4: Renewal confirmation (external flag from payment webhook)
  // This is a special case that doesn't follow status transition rules
  // ─────────────────────────────────────────────────────────────────────────
  if (isRenewalConfirmation === true && newStatus === 'ACTIVE') {
    const templateId = 'membership_renewed' as const;
    return {
      shouldSendEmail: true,
      templateId,
      ctaUrl: buildCtaUrl(baseUrl, tenant.slug, CTA_PATHS[templateId]),
      locale,
      payload: {
        templateId,
        athleteName: athlete.fullName,
        tenantName: tenant.name,
        newExpirationDate: membership.endDate ?? '',
        portalUrl: buildCtaUrl(baseUrl, tenant.slug, '/portal'),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 5: PENDING_REVIEW → APPROVED (membership approved)
  // ─────────────────────────────────────────────────────────────────────────
  if (previousStatus === 'PENDING_REVIEW' && newStatus === 'APPROVED') {
    const templateId = 'membership_approved' as const;
    return {
      shouldSendEmail: true,
      templateId,
      ctaUrl: buildCtaUrl(baseUrl, tenant.slug, CTA_PATHS[templateId]),
      locale,
      payload: {
        templateId,
        athleteName: athlete.fullName,
        tenantName: tenant.name,
        portalUrl: buildCtaUrl(baseUrl, tenant.slug, '/portal'),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 6: PENDING_REVIEW → REJECTED (membership rejected)
  // ─────────────────────────────────────────────────────────────────────────
  if (previousStatus === 'PENDING_REVIEW' && newStatus === 'REJECTED') {
    const templateId = 'membership_rejected' as const;
    return {
      shouldSendEmail: true,
      templateId,
      ctaUrl: buildCtaUrl(baseUrl, tenant.slug, CTA_PATHS[templateId]),
      locale,
      payload: {
        templateId,
        athleteName: athlete.fullName,
        tenantName: tenant.name,
        rejectionReason: membership.rejectionReason ?? 'Motivo não informado',
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 7: ACTIVE → EXPIRED (membership expired)
  // ─────────────────────────────────────────────────────────────────────────
  if (previousStatus === 'ACTIVE' && newStatus === 'EXPIRED') {
    const templateId = 'membership_expired' as const;
    return {
      shouldSendEmail: true,
      templateId,
      ctaUrl: buildCtaUrl(baseUrl, tenant.slug, CTA_PATHS[templateId]),
      locale,
      payload: {
        templateId,
        athleteName: athlete.fullName,
        tenantName: tenant.name,
        expirationDate: membership.endDate ?? '',
        renewUrl: buildCtaUrl(baseUrl, tenant.slug, '/membership/renew'),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RULE 8 & 9: ACTIVE → CANCELLED or APPROVED → CANCELLED
  // ─────────────────────────────────────────────────────────────────────────
  if (
    (previousStatus === 'ACTIVE' && newStatus === 'CANCELLED') ||
    (previousStatus === 'APPROVED' && newStatus === 'CANCELLED')
  ) {
    const templateId = 'membership_cancelled' as const;
    return {
      shouldSendEmail: true,
      templateId,
      ctaUrl: buildCtaUrl(baseUrl, tenant.slug, CTA_PATHS[templateId]),
      locale,
      payload: {
        templateId,
        athleteName: athlete.fullName,
        tenantName: tenant.name,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEFAULT: Don't send for any unlisted transition
  // This is the fail-safe - explicit opt-out for unknown transitions
  // ─────────────────────────────────────────────────────────────────────────
  return { shouldSendEmail: false };
}

// ============================================================================
// TYPE GUARDS (for consumers)
// ============================================================================

/**
 * Type guard to check if decision requires sending an email.
 */
export function shouldSend(decision: NotificationDecision): decision is SendNotificationDecision {
  return decision.shouldSendEmail === true;
}

/**
 * Type guard to check if decision is a no-op.
 */
export function shouldNotSend(decision: NotificationDecision): decision is NoNotificationDecision {
  return decision.shouldSendEmail === false;
}
