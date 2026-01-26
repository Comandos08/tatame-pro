/**
 * NOTIFICATION ENGINE — Unit Tests
 * 
 * Tests the pure decision layer for membership email notifications.
 * 
 * SCOPE:
 * ✅ Decision logic (shouldSendEmail, templateId, ctaUrl, payload)
 * ❌ Email sending (Resend, SMTP, etc.)
 * ❌ Database access
 * ❌ Edge Functions
 * ❌ i18n text content
 */

import { describe, it, expect } from 'vitest';
import {
  resolveMembershipNotification,
  type NotificationInput,
  type MembershipStatus,
} from '../resolveMembershipNotification';

// ============================================================================
// BASE INPUT (Reusable template)
// ============================================================================

const baseInput: NotificationInput = {
  previousStatus: 'PENDING_REVIEW',
  newStatus: 'APPROVED',
  membership: {
    id: 'm-123',
    endDate: '2026-01-31',
    rejectionReason: 'Documento inválido',
  },
  athlete: {
    fullName: 'John Doe',
    email: 'john@example.com',
    preferredLocale: 'pt-BR',
  },
  tenant: {
    name: 'Federação Demo',
    slug: 'demo-bjj',
    defaultLocale: 'pt-BR',
  },
  baseUrl: 'https://tatame.app',
};

/**
 * Helper to create input with overrides
 */
function createInput(overrides: Partial<NotificationInput>): NotificationInput {
  return {
    ...baseInput,
    ...overrides,
    membership: { ...baseInput.membership, ...overrides.membership },
    athlete: { ...baseInput.athlete, ...overrides.athlete },
    tenant: { ...baseInput.tenant, ...overrides.tenant },
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Notification Engine — resolveMembershipNotification', () => {
  // ==========================================================================
  // TRANSITIONS THAT MUST SEND EMAIL
  // ==========================================================================

  describe('Transitions that MUST send email', () => {
    it('PENDING_REVIEW → APPROVED sends membership_approved email', () => {
      const input = createInput({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'APPROVED',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.templateId).toBe('membership_approved');
        expect(result.ctaUrl).toContain('/demo-bjj/portal');
        expect(result.locale).toBe('pt-BR');
        expect(result.payload.athleteName).toBe('John Doe');
        expect(result.payload.tenantName).toBe('Federação Demo');
        expect('portalUrl' in result.payload).toBe(true);
      }
    });

    it('PENDING_REVIEW → REJECTED sends membership_rejected email', () => {
      const input = createInput({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'REJECTED',
        membership: { id: 'm-456', rejectionReason: 'Documento ilegível' },
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.templateId).toBe('membership_rejected');
        expect(result.ctaUrl).toContain('/demo-bjj/membership/new');
        expect(result.locale).toBe('pt-BR');
        expect(result.payload.athleteName).toBe('John Doe');
        expect(result.payload.tenantName).toBe('Federação Demo');
        expect('rejectionReason' in result.payload).toBe(true);
        if ('rejectionReason' in result.payload) {
          expect(result.payload.rejectionReason).toBe('Documento ilegível');
        }
      }
    });

    it('ACTIVE → EXPIRED sends membership_expired email', () => {
      const input = createInput({
        previousStatus: 'ACTIVE',
        newStatus: 'EXPIRED',
        membership: { id: 'm-789', endDate: '2026-01-15' },
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.templateId).toBe('membership_expired');
        expect(result.ctaUrl).toContain('/demo-bjj/membership/renew');
        expect(result.locale).toBe('pt-BR');
        expect(result.payload.athleteName).toBe('John Doe');
        expect(result.payload.tenantName).toBe('Federação Demo');
        expect('expirationDate' in result.payload).toBe(true);
        expect('renewUrl' in result.payload).toBe(true);
      }
    });

    it('ACTIVE → CANCELLED sends membership_cancelled email', () => {
      const input = createInput({
        previousStatus: 'ACTIVE',
        newStatus: 'CANCELLED',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.templateId).toBe('membership_cancelled');
        expect(result.ctaUrl).toContain('/demo-bjj/membership/new');
        expect(result.locale).toBe('pt-BR');
        expect(result.payload.athleteName).toBe('John Doe');
        expect(result.payload.tenantName).toBe('Federação Demo');
      }
    });

    it('APPROVED → CANCELLED sends membership_cancelled email', () => {
      const input = createInput({
        previousStatus: 'APPROVED',
        newStatus: 'CANCELLED',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.templateId).toBe('membership_cancelled');
        expect(result.ctaUrl).toContain('/demo-bjj/membership/new');
        expect(result.locale).toBe('pt-BR');
        expect(result.payload.athleteName).toBe('John Doe');
        expect(result.payload.tenantName).toBe('Federação Demo');
      }
    });
  });

  // ==========================================================================
  // RENEWAL CONFIRMATION
  // ==========================================================================

  describe('Renewal confirmation', () => {
    it('sends membership_renewed when isRenewalConfirmation flag is true', () => {
      const input = createInput({
        previousStatus: 'EXPIRED',
        newStatus: 'ACTIVE',
        isRenewalConfirmation: true,
        membership: { id: 'm-renewal', endDate: '2027-01-31' },
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.templateId).toBe('membership_renewed');
        expect(result.ctaUrl).toContain('/demo-bjj/portal');
        expect(result.locale).toBe('pt-BR');
        expect(result.payload.athleteName).toBe('John Doe');
        expect(result.payload.tenantName).toBe('Federação Demo');
        expect('newExpirationDate' in result.payload).toBe(true);
        expect('portalUrl' in result.payload).toBe(true);
      }
    });

    it('does not send renewal email without isRenewalConfirmation flag', () => {
      const input = createInput({
        previousStatus: 'EXPIRED',
        newStatus: 'ACTIVE',
        isRenewalConfirmation: false,
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(false);
    });

    it('does not send renewal email when flag is undefined', () => {
      const input = createInput({
        previousStatus: 'EXPIRED',
        newStatus: 'ACTIVE',
      });
      // Ensure isRenewalConfirmation is not set
      delete (input as any).isRenewalConfirmation;

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(false);
    });
  });

  // ==========================================================================
  // TRANSITIONS THAT MUST NOT SEND EMAIL
  // ==========================================================================

  describe('Transitions that MUST NOT send email', () => {
    // Same status transitions (no change)
    describe('Same status transitions (no-op)', () => {
      const sameStatusCases: MembershipStatus[] = [
        'ACTIVE',
        'APPROVED',
        'PENDING_REVIEW',
        'EXPIRED',
        'CANCELLED',
        'REJECTED',
      ];

      sameStatusCases.forEach((status) => {
        it(`${status} → ${status} does not send email`, () => {
          const input = createInput({
            previousStatus: status,
            newStatus: status,
          });

          const result = resolveMembershipNotification(input);

          expect(result.shouldSendEmail).toBe(false);
        });
      });
    });

    // DRAFT transitions (initial flow, no email)
    describe('DRAFT transitions', () => {
      it('DRAFT → PENDING_REVIEW does not send email', () => {
        const input = createInput({
          previousStatus: 'DRAFT',
          newStatus: 'PENDING_REVIEW',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });

      it('DRAFT → PENDING_PAYMENT does not send email', () => {
        const input = createInput({
          previousStatus: 'DRAFT',
          newStatus: 'PENDING_PAYMENT',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });
    });

    // PENDING_PAYMENT transitions (payment system handles its own notifications)
    describe('PENDING_PAYMENT transitions', () => {
      it('PENDING_PAYMENT → PENDING_REVIEW does not send email', () => {
        const input = createInput({
          previousStatus: 'PENDING_PAYMENT',
          newStatus: 'PENDING_REVIEW',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });

      it('DRAFT → PENDING_PAYMENT does not send email', () => {
        const input = createInput({
          previousStatus: 'DRAFT',
          newStatus: 'PENDING_PAYMENT',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });
    });

    // Unlisted transitions (default to no email)
    describe('Unlisted transitions (default behavior)', () => {
      it('APPROVED → ACTIVE does not send email', () => {
        const input = createInput({
          previousStatus: 'APPROVED',
          newStatus: 'ACTIVE',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });

      it('EXPIRED → CANCELLED does not send email', () => {
        const input = createInput({
          previousStatus: 'EXPIRED',
          newStatus: 'CANCELLED',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });

      it('CANCELLED → EXPIRED does not send email', () => {
        const input = createInput({
          previousStatus: 'CANCELLED',
          newStatus: 'EXPIRED',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });

      it('REJECTED → PENDING_REVIEW does not send email', () => {
        const input = createInput({
          previousStatus: 'REJECTED',
          newStatus: 'PENDING_REVIEW',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });

      it('null → PENDING_REVIEW (new membership) does not send email', () => {
        const input = createInput({
          previousStatus: null,
          newStatus: 'PENDING_REVIEW',
        });

        const result = resolveMembershipNotification(input);

        expect(result.shouldSendEmail).toBe(false);
      });
    });
  });

  // ==========================================================================
  // LOCALE RESOLUTION
  // ==========================================================================

  describe('Locale resolution', () => {
    it('uses athlete preferredLocale when available', () => {
      const result = resolveMembershipNotification({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'APPROVED',
        membership: { id: 'm-loc1' },
        athlete: {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          preferredLocale: 'en',
        },
        tenant: {
          name: 'Demo Federation',
          slug: 'demo-fed',
          defaultLocale: 'pt-BR',
        },
        baseUrl: 'https://tatame.app',
      });

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.locale).toBe('en');
      }
    });

    it('falls back to tenant defaultLocale when athlete has no preference', () => {
      const result = resolveMembershipNotification({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'APPROVED',
        membership: { id: 'm-loc2' },
        athlete: {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          // No preferredLocale - should fall back to tenant default
        },
        tenant: {
          name: 'Demo Federation',
          slug: 'demo-fed',
          defaultLocale: 'en',
        },
        baseUrl: 'https://tatame.app',
      });

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.locale).toBe('en');
      }
    });
  });

  // ==========================================================================
  // CTA URL CONSTRUCTION
  // ==========================================================================

  describe('CTA URL construction', () => {
    it('correctly builds portal URL with baseUrl and tenantSlug', () => {
      const input = createInput({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'APPROVED',
        tenant: { name: 'Test Fed', slug: 'test-fed', defaultLocale: 'pt-BR' },
        baseUrl: 'https://custom.domain.com',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.ctaUrl).toBe('https://custom.domain.com/test-fed/portal');
      }
    });

    it('correctly builds renewal URL for expired membership', () => {
      const input = createInput({
        previousStatus: 'ACTIVE',
        newStatus: 'EXPIRED',
        tenant: { name: 'Test Fed', slug: 'my-federation', defaultLocale: 'pt-BR' },
        baseUrl: 'https://app.tatame.pro',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.ctaUrl).toBe('https://app.tatame.pro/my-federation/membership/renew');
      }
    });

    it('correctly builds new membership URL for cancelled', () => {
      const input = createInput({
        previousStatus: 'ACTIVE',
        newStatus: 'CANCELLED',
        tenant: { name: 'BJJ League', slug: 'bjj-league', defaultLocale: 'en' },
        baseUrl: 'https://platform.io',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        expect(result.ctaUrl).toBe('https://platform.io/bjj-league/membership/new');
      }
    });

    it('handles baseUrl with trailing slash', () => {
      const input = createInput({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'APPROVED',
        tenant: { name: 'Test', slug: 'test', defaultLocale: 'pt-BR' },
        baseUrl: 'https://tatame.app/', // Trailing slash
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail) {
        // Should NOT have double slash
        expect(result.ctaUrl).toBe('https://tatame.app/test/portal');
        expect(result.ctaUrl).not.toContain('//test');
      }
    });
  });

  // ==========================================================================
  // PAYLOAD COMPLETENESS
  // ==========================================================================

  describe('Payload completeness', () => {
    it('membership_approved payload has required fields', () => {
      const input = createInput({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'APPROVED',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail && result.templateId === 'membership_approved') {
        expect(result.payload).toHaveProperty('athleteName');
        expect(result.payload).toHaveProperty('tenantName');
        expect(result.payload).toHaveProperty('portalUrl');
        expect(result.payload).toHaveProperty('templateId', 'membership_approved');
      }
    });

    it('membership_rejected payload has required fields including reason', () => {
      const input = createInput({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'REJECTED',
        membership: { id: 'm-rej', rejectionReason: 'CPF inválido' },
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail && result.templateId === 'membership_rejected') {
        expect(result.payload).toHaveProperty('athleteName');
        expect(result.payload).toHaveProperty('tenantName');
        expect(result.payload).toHaveProperty('rejectionReason', 'CPF inválido');
        expect(result.payload).toHaveProperty('templateId', 'membership_rejected');
      }
    });

    it('membership_rejected provides default reason when not specified', () => {
      const input = createInput({
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'REJECTED',
        membership: { id: 'm-rej' }, // No rejectionReason
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail && result.templateId === 'membership_rejected') {
        expect(result.payload).toHaveProperty('rejectionReason');
        // Should have a non-empty default
        if ('rejectionReason' in result.payload) {
          expect(result.payload.rejectionReason.length).toBeGreaterThan(0);
        }
      }
    });

    it('membership_expired payload has expiration date and renew URL', () => {
      const input = createInput({
        previousStatus: 'ACTIVE',
        newStatus: 'EXPIRED',
        membership: { id: 'm-exp', endDate: '2026-02-28' },
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail && result.templateId === 'membership_expired') {
        expect(result.payload).toHaveProperty('athleteName');
        expect(result.payload).toHaveProperty('tenantName');
        expect(result.payload).toHaveProperty('expirationDate', '2026-02-28');
        expect(result.payload).toHaveProperty('renewUrl');
        expect(result.payload).toHaveProperty('templateId', 'membership_expired');
      }
    });

    it('membership_renewed payload has new expiration date and portal URL', () => {
      const input = createInput({
        previousStatus: 'EXPIRED',
        newStatus: 'ACTIVE',
        isRenewalConfirmation: true,
        membership: { id: 'm-ren', endDate: '2027-03-15' },
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail && result.templateId === 'membership_renewed') {
        expect(result.payload).toHaveProperty('athleteName');
        expect(result.payload).toHaveProperty('tenantName');
        expect(result.payload).toHaveProperty('newExpirationDate', '2027-03-15');
        expect(result.payload).toHaveProperty('portalUrl');
        expect(result.payload).toHaveProperty('templateId', 'membership_renewed');
      }
    });

    it('membership_cancelled payload has minimal required fields', () => {
      const input = createInput({
        previousStatus: 'ACTIVE',
        newStatus: 'CANCELLED',
      });

      const result = resolveMembershipNotification(input);

      expect(result.shouldSendEmail).toBe(true);
      if (result.shouldSendEmail && result.templateId === 'membership_cancelled') {
        expect(result.payload).toHaveProperty('athleteName');
        expect(result.payload).toHaveProperty('tenantName');
        expect(result.payload).toHaveProperty('templateId', 'membership_cancelled');
      }
    });
  });
});
