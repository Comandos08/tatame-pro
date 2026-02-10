// ============================================================================
// PI U18 — SYSTEM SELF-AWARENESS (Pure Model + Derive)
// ============================================================================
//
// NO React. NO hooks. NO side effects. Pure types + pure function.
//
// Derives the system's self-awareness state from existing sources:
// - SafeHealthStatus (HEALTH1.0 FROZEN)
// - TenantLifecycleStatus (stateDefinitions)
// - BillingStatus (billing resolver)
// - IdentityState (IdentityContext)
//
// Single derive function → single output → single banner.
// ============================================================================

import type { SafeHealthStatus } from '@/types/health-state';
import type { TenantLifecycleState } from '@/types/tenant-lifecycle-state';
import type { BillingStatus } from '@/lib/billing';
import type { IdentityState } from '@/contexts/IdentityContext';

// ── Types ──

export type SystemAwarenessLevel = 'OK' | 'INFO' | 'WARN' | 'CRITICAL';

export const SYSTEM_LIMIT_REASONS = [
  'TENANT_INACTIVE',
  'TENANT_SUSPENDED',
  'TENANT_SETUP',
  'BILLING_BLOCKED',
  'BILLING_PAST_DUE',
  'BILLING_TRIAL_EXPIRING',
  'IDENTITY_PENDING',
  'IDENTITY_ERROR',
  'HEALTH_DEGRADED',
  'HEALTH_CRITICAL',
  'HEALTH_UNKNOWN',
] as const;

export type SystemLimitReason = (typeof SYSTEM_LIMIT_REASONS)[number];

export interface SystemAwarenessCTA {
  labelKey: string;
  href: string;
}

export interface SystemAwarenessState {
  level: SystemAwarenessLevel;
  health: SafeHealthStatus;
  reasons: SystemLimitReason[];
  messageKey: string;
  subtitleKey: string;
  cta?: SystemAwarenessCTA;
}

// ── Input (aggregated by hook, not by this module) ──

export interface SystemAwarenessInput {
  health: SafeHealthStatus;
  tenantStatus: TenantLifecycleState | null;
  billingStatus: BillingStatus | null;
  identityState: IdentityState;
  tenantSlug?: string | null;
  isTrialEndingSoon?: boolean;
  daysToTrialEnd?: number | null;
}

// ── Pure derive function ──

export function deriveSystemAwarenessState(input: SystemAwarenessInput): SystemAwarenessState {
  const reasons: SystemLimitReason[] = [];
  let level: SystemAwarenessLevel = 'OK';

  // 1. Identity checks (highest priority — system can't function without identity)
  if (input.identityState === 'loading') {
    reasons.push('IDENTITY_PENDING');
  }
  if (input.identityState === 'error') {
    reasons.push('IDENTITY_ERROR');
  }

  // 2. Tenant lifecycle checks (uses normalized TenantLifecycleState: SETUP | ACTIVE | BLOCKED | DELETED)
  if (input.tenantStatus === 'DELETED') {
    reasons.push('TENANT_INACTIVE');
  } else if (input.tenantStatus === 'BLOCKED') {
    reasons.push('TENANT_SUSPENDED');
  } else if (input.tenantStatus === 'SETUP') {
    reasons.push('TENANT_SETUP');
  }

  // 3. Billing checks
  if (input.billingStatus === 'PENDING_DELETE' || input.billingStatus === 'CANCELED') {
    reasons.push('BILLING_BLOCKED');
  } else if (input.billingStatus === 'TRIAL_EXPIRED' || input.billingStatus === 'PAST_DUE') {
    reasons.push('BILLING_PAST_DUE');
  } else if (input.isTrialEndingSoon && input.billingStatus === 'TRIALING') {
    reasons.push('BILLING_TRIAL_EXPIRING');
  }

  // 4. Health checks
  if (input.health === 'CRITICAL') {
    reasons.push('HEALTH_CRITICAL');
  } else if (input.health === 'DEGRADED') {
    reasons.push('HEALTH_DEGRADED');
  } else if (input.health === 'UNKNOWN') {
    reasons.push('HEALTH_UNKNOWN');
  }

  // ── Derive level from reasons ──
  if (reasons.length === 0) {
    level = 'OK';
  } else if (
    reasons.includes('TENANT_INACTIVE') ||
    reasons.includes('BILLING_BLOCKED') ||
    reasons.includes('HEALTH_CRITICAL') ||
    reasons.includes('IDENTITY_ERROR')
  ) {
    level = 'CRITICAL';
  } else if (
    reasons.includes('TENANT_SUSPENDED') ||
    reasons.includes('BILLING_PAST_DUE') ||
    reasons.includes('HEALTH_DEGRADED')
  ) {
    level = 'WARN';
  } else {
    level = 'INFO';
  }

  // ── Derive message keys ──
  const messageKey = `selfAware.title.${level.toLowerCase()}`;
  const subtitleKey = reasons.length > 0
    ? `selfAware.subtitle.${level.toLowerCase()}`
    : `selfAware.subtitle.ok`;

  // ── Derive CTA ──
  let cta: SystemAwarenessCTA | undefined;

  if (reasons.includes('BILLING_BLOCKED') || reasons.includes('BILLING_PAST_DUE')) {
    cta = {
      labelKey: 'selfAware.cta.billing',
      href: input.tenantSlug ? `/${input.tenantSlug}/app/billing` : '/portal',
    };
  } else if (reasons.includes('TENANT_SETUP')) {
    cta = {
      labelKey: 'selfAware.cta.completeSetup',
      href: input.tenantSlug ? `/${input.tenantSlug}/app/settings` : '/portal',
    };
  }

  return {
    level,
    health: input.health,
    reasons,
    messageKey,
    subtitleKey,
    cta,
  };
}
