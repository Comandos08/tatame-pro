/**
 * NOTIFICATION ENGINE — Usage Examples
 * 
 * These examples demonstrate the pure, deterministic nature
 * of the resolveMembershipNotification function.
 * 
 * NOTE: This file is for documentation purposes only.
 * It is NOT executed in production.
 */

import { logger } from '@/lib/logger';
import {
  resolveMembershipNotification,
  shouldSend,
  type NotificationInput,
} from './resolveMembershipNotification';

// ============================================================================
// EXAMPLE 1: Membership Approved
// Transition: PENDING_REVIEW → APPROVED
// Expected: Email sent with membership_approved template
// ============================================================================

const example1_input: NotificationInput = {
  previousStatus: 'PENDING_REVIEW',
  newStatus: 'APPROVED',
  membership: {
    id: 'mem_abc123',
    endDate: '2026-01-26',
  },
  athlete: {
    fullName: 'João Silva',
    email: 'joao@example.com',
    preferredLocale: 'pt-BR',
  },
  tenant: {
    name: 'Federação Brasileira de Jiu-Jitsu',
    slug: 'fbjj',
    defaultLocale: 'pt-BR',
  },
  baseUrl: 'https://tatame.pro',
};

const example1_output = resolveMembershipNotification(example1_input);
// Result:
// {
//   shouldSendEmail: true,
//   templateId: 'membership_approved',
//   ctaUrl: 'https://tatame.pro/fbjj/portal',
//   locale: 'pt-BR',
//   payload: {
//     templateId: 'membership_approved',
//     athleteName: 'João Silva',
//     tenantName: 'Federação Brasileira de Jiu-Jitsu',
//     portalUrl: 'https://tatame.pro/fbjj/portal'
//   }
// }

// ============================================================================
// EXAMPLE 2: No Change (Same Status)
// Transition: ACTIVE → ACTIVE
// Expected: No email sent
// ============================================================================

const example2_input: NotificationInput = {
  previousStatus: 'ACTIVE',
  newStatus: 'ACTIVE',
  membership: {
    id: 'mem_xyz789',
    endDate: '2026-06-15',
  },
  athlete: {
    fullName: 'Maria Santos',
    email: 'maria@example.com',
  },
  tenant: {
    name: 'BJJ Federation',
    slug: 'bjj-fed',
    defaultLocale: 'en',
  },
  baseUrl: 'https://tatame.pro',
};

const example2_output = resolveMembershipNotification(example2_input);
// Result:
// {
//   shouldSendEmail: false
// }

// ============================================================================
// EXAMPLE 3: Membership Expired
// Transition: ACTIVE → EXPIRED
// Expected: Email sent with membership_expired template
// ============================================================================

const example3_input: NotificationInput = {
  previousStatus: 'ACTIVE',
  newStatus: 'EXPIRED',
  membership: {
    id: 'mem_def456',
    endDate: '2026-01-25',
  },
  athlete: {
    fullName: 'Carlos Oliveira',
    email: 'carlos@example.com',
    preferredLocale: 'pt-BR',
  },
  tenant: {
    name: 'Liga Nacional de Judô',
    slug: 'lnj',
    defaultLocale: 'pt-BR',
  },
  baseUrl: 'https://tatame.pro',
};

const example3_output = resolveMembershipNotification(example3_input);
// Result:
// {
//   shouldSendEmail: true,
//   templateId: 'membership_expired',
//   ctaUrl: 'https://tatame.pro/lnj/membership/renew',
//   locale: 'pt-BR',
//   payload: {
//     templateId: 'membership_expired',
//     athleteName: 'Carlos Oliveira',
//     tenantName: 'Liga Nacional de Judô',
//     expirationDate: '2026-01-25',
//     renewUrl: 'https://tatame.pro/lnj/membership/renew'
//   }
// }

// ============================================================================
// EXAMPLE 4: Renewal Confirmation
// Transition: EXPIRED → ACTIVE (with isRenewalConfirmation flag)
// Expected: Email sent with membership_renewed template
// ============================================================================

const example4_input: NotificationInput = {
  previousStatus: 'EXPIRED',
  newStatus: 'ACTIVE',
  isRenewalConfirmation: true,
  membership: {
    id: 'mem_ghi789',
    endDate: '2027-01-26',
  },
  athlete: {
    fullName: 'Ana Costa',
    email: 'ana@example.com',
  },
  tenant: {
    name: 'Federação de Karatê',
    slug: 'karate-br',
    defaultLocale: 'pt-BR',
  },
  baseUrl: 'https://tatame.pro',
};

const example4_output = resolveMembershipNotification(example4_input);
// Result:
// {
//   shouldSendEmail: true,
//   templateId: 'membership_renewed',
//   ctaUrl: 'https://tatame.pro/karate-br/portal',
//   locale: 'pt-BR',
//   payload: {
//     templateId: 'membership_renewed',
//     athleteName: 'Ana Costa',
//     tenantName: 'Federação de Karatê',
//     newExpirationDate: '2027-01-26',
//     portalUrl: 'https://tatame.pro/karate-br/portal'
//   }
// }

// ============================================================================
// EXAMPLE 5: Membership Rejected
// Transition: PENDING_REVIEW → REJECTED
// Expected: Email sent with membership_rejected template
// ============================================================================

const example5_input: NotificationInput = {
  previousStatus: 'PENDING_REVIEW',
  newStatus: 'REJECTED',
  membership: {
    id: 'mem_jkl012',
    rejectionReason: 'Documento de identidade ilegível. Por favor, envie uma foto mais nítida.',
  },
  athlete: {
    fullName: 'Pedro Mendes',
    email: 'pedro@example.com',
    preferredLocale: 'pt-BR',
  },
  tenant: {
    name: 'Associação de Wrestling',
    slug: 'wrestling-br',
    defaultLocale: 'pt-BR',
  },
  baseUrl: 'https://tatame.pro',
};

const example5_output = resolveMembershipNotification(example5_input);
// Result:
// {
//   shouldSendEmail: true,
//   templateId: 'membership_rejected',
//   ctaUrl: 'https://tatame.pro/wrestling-br/membership/new',
//   locale: 'pt-BR',
//   payload: {
//     templateId: 'membership_rejected',
//     athleteName: 'Pedro Mendes',
//     tenantName: 'Associação de Wrestling',
//     rejectionReason: 'Documento de identidade ilegível. Por favor, envie uma foto mais nítida.'
//   }
// }

// ============================================================================
// TYPE GUARD USAGE EXAMPLE
// ============================================================================

function processDecision(input: NotificationInput): void {
  const decision = resolveMembershipNotification(input);
  
  if (shouldSend(decision)) {
    // TypeScript knows decision has templateId, ctaUrl, locale, payload
    logger.log(`Template: ${decision.templateId}`);
    logger.log(`CTA: ${decision.ctaUrl}`);
    logger.log(`Locale: ${decision.locale}`);
    // This is where the email sender would be called
  } else {
    // TypeScript knows decision only has shouldSendEmail: false
    logger.log('No email to send');
  }
}

// Export for documentation
export const examples = {
  approved: { input: example1_input, output: example1_output },
  noChange: { input: example2_input, output: example2_output },
  expired: { input: example3_input, output: example3_output },
  renewed: { input: example4_input, output: example4_output },
  rejected: { input: example5_input, output: example5_output },
};
