/**
 * NOTIFICATION ENGINE — Deno-compatible version for Edge Functions
 * 
 * Pure decision layer for membership email notifications.
 * This is a copy of src/lib/notifications/resolveMembershipNotification.ts
 * adapted for Deno runtime (no external imports).
 * 
 * IMPORTANT: Keep in sync with the frontend version.
 */

// ============================================================================
// TYPES
// ============================================================================

export type MembershipStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REJECTED';

export type SpecialState = 'NO_ATHLETE' | 'ERROR';

export type NotificationTemplateId =
  | 'membership_approved'
  | 'membership_rejected'
  | 'membership_expired'
  | 'membership_cancelled'
  | 'membership_renewed';

export type SupportedLocale = 'pt-BR' | 'en';

export interface NoNotificationDecision {
  shouldSendEmail: false;
}

export interface SendNotificationDecision {
  shouldSendEmail: true;
  templateId: NotificationTemplateId;
  ctaUrl: string;
  locale: SupportedLocale;
  payload: NotificationPayload;
}

export type NotificationDecision = NoNotificationDecision | SendNotificationDecision;

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

export interface NotificationInput {
  previousStatus: MembershipStatus | null;
  newStatus: MembershipStatus;
  isRenewalConfirmation?: boolean;
  membership: {
    id: string;
    endDate?: string;
    rejectionReason?: string;
  };
  athlete: {
    fullName: string;
    email: string;
    preferredLocale?: SupportedLocale;
  };
  tenant: {
    name: string;
    slug: string;
    defaultLocale: SupportedLocale;
  };
  baseUrl: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CTA_PATHS: Record<NotificationTemplateId, string> = {
  membership_approved: '/portal',
  membership_rejected: '/membership/new',
  membership_expired: '/membership/renew',
  membership_cancelled: '/membership/new',
  membership_renewed: '/portal',
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function resolveLocale(input: NotificationInput): SupportedLocale {
  return input.athlete.preferredLocale ?? input.tenant.defaultLocale;
}

function buildCtaUrl(baseUrl: string, tenantSlug: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return `${normalizedBase}/${tenantSlug}${path}`;
}

function isSameStatusTransition(prev: MembershipStatus | null, next: MembershipStatus): boolean {
  return prev === next;
}

// ============================================================================
// MAIN RESOLVER FUNCTION
// ============================================================================

export function resolveMembershipNotification(input: NotificationInput): NotificationDecision {
  const { previousStatus, newStatus, isRenewalConfirmation, membership, athlete, tenant, baseUrl } = input;

  // RULE 1: No email for same-status transitions
  if (isSameStatusTransition(previousStatus, newStatus)) {
    return { shouldSendEmail: false };
  }

  // RULE 2: No email for DRAFT → PENDING_REVIEW
  if (previousStatus === 'DRAFT' && newStatus === 'PENDING_REVIEW') {
    return { shouldSendEmail: false };
  }

  // RULE 3: No email for PENDING_PAYMENT transitions
  if (previousStatus === 'PENDING_PAYMENT' || newStatus === 'PENDING_PAYMENT') {
    return { shouldSendEmail: false };
  }

  const locale = resolveLocale(input);

  // RULE 4: Renewal confirmation
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

  // RULE 5: PENDING_REVIEW → APPROVED
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

  // RULE 6: PENDING_REVIEW → REJECTED
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

  // RULE 7: ACTIVE → EXPIRED
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

  // RULE 8 & 9: ACTIVE → CANCELLED or APPROVED → CANCELLED
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

  // DEFAULT: Don't send for any unlisted transition
  return { shouldSendEmail: false };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function shouldSend(decision: NotificationDecision): decision is SendNotificationDecision {
  return decision.shouldSendEmail === true;
}

export function shouldNotSend(decision: NotificationDecision): decision is NoNotificationDecision {
  return decision.shouldSendEmail === false;
}
