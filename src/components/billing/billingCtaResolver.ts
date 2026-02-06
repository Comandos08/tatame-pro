/**
 * BillingCTAResolver — Pure function to resolve CTAs based on billing status
 * 
 * P3.3 — Billing UX Advanced Layer
 * 
 * RULES:
 * - Pure function (no side effects)
 * - No React imports
 * - Deterministic output based on status
 */

import type { BillingStatus } from '@/lib/billing/resolveTenantBillingState';

export interface BillingCTA {
  labelKey: string;
  action: 'upgrade' | 'manage' | 'reactivate' | 'contact';
  variant: 'default' | 'destructive' | 'outline';
}

/**
 * Resolves the primary CTA for a given billing status
 * 
 * @param billingStatus - Current billing status
 * @returns BillingCTA or null if no action needed
 */
export function resolveBillingCTA(billingStatus: BillingStatus | null): BillingCTA | null {
  if (!billingStatus) return null;

  switch (billingStatus) {
    case 'TRIALING':
      return {
        labelKey: 'billing.cta.upgrade',
        action: 'upgrade',
        variant: 'default',
      };

    case 'TRIAL_EXPIRED':
      return {
        labelKey: 'billing.cta.upgrade',
        action: 'upgrade',
        variant: 'destructive',
      };

    case 'ACTIVE':
      return {
        labelKey: 'billing.cta.manage',
        action: 'manage',
        variant: 'outline',
      };

    case 'PAST_DUE':
      return {
        labelKey: 'billing.cta.reactivate',
        action: 'reactivate',
        variant: 'destructive',
      };

    case 'PENDING_DELETE':
      return {
        labelKey: 'billing.cta.reactivate',
        action: 'reactivate',
        variant: 'destructive',
      };

    case 'CANCELED':
      return {
        labelKey: 'billing.cta.contactSupport',
        action: 'contact',
        variant: 'outline',
      };

    case 'UNPAID':
    case 'INCOMPLETE':
      return {
        labelKey: 'billing.cta.reactivate',
        action: 'reactivate',
        variant: 'destructive',
      };

    default:
      return null;
  }
}

/**
 * Resolves the icon name for a billing status (for use with lucide-react)
 */
export function resolveBillingStatusIcon(billingStatus: BillingStatus | null): string {
  if (!billingStatus) return 'CreditCard';

  switch (billingStatus) {
    case 'TRIALING':
      return 'Clock';
    case 'TRIAL_EXPIRED':
      return 'AlertTriangle';
    case 'ACTIVE':
      return 'CheckCircle';
    case 'PAST_DUE':
      return 'AlertCircle';
    case 'PENDING_DELETE':
      return 'Trash2';
    case 'CANCELED':
      return 'XCircle';
    default:
      return 'CreditCard';
  }
}

/**
 * Resolves the color variant for a billing status
 */
export function resolveBillingStatusVariant(billingStatus: BillingStatus | null): 'success' | 'warning' | 'destructive' | 'muted' {
  if (!billingStatus) return 'muted';

  switch (billingStatus) {
    case 'ACTIVE':
      return 'success';
    case 'TRIALING':
      return 'warning';
    case 'TRIAL_EXPIRED':
    case 'PAST_DUE':
      return 'warning';
    case 'PENDING_DELETE':
    case 'CANCELED':
    case 'UNPAID':
    case 'INCOMPLETE':
      return 'destructive';
    default:
      return 'muted';
  }
}
