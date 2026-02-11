/**
 * PI-U02 — Tenant Onboarding Derivation (SAFE GOLD)
 *
 * Pure deterministic derivation of tenant activation checklist.
 * No React, No Supabase, No side effects, No mutations.
 *
 * All steps are computed from real state — nothing is saved manually.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type OnboardingStepStatus = 'LOCKED' | 'PENDING' | 'DONE';

export type OnboardingStepId =
  | 'TENANT_CREATED'
  | 'ROLE_ASSIGNED'
  | 'MEMBERSHIP_CONFIGURED'
  | 'FIRST_MEMBER_APPROVED'
  | 'BILLING_ACTIVE'
  | 'SECURITY_OK';

export interface TenantOnboardingStep {
  id: OnboardingStepId;
  titleKey: string;
  descriptionKey: string;
  status: OnboardingStepStatus;
  blocking: boolean;
}

export interface TenantOnboardingResult {
  steps: TenantOnboardingStep[];
  completionPercent: number;
  isFullyActivated: boolean;
}

export interface TenantOnboardingInput {
  tenantLifecycle: string | null;
  hasRole: boolean;
  membershipCount: number;
  billingStatus: string | null;
  securityPosture: 'OK' | 'WARNING' | 'CRITICAL' | 'ERROR';
}

// ── Derivation ─────────────────────────────────────────────────────────────

export function deriveTenantOnboarding(input: TenantOnboardingInput): TenantOnboardingResult {
  const steps: TenantOnboardingStep[] = [];

  // 1. TENANT_CREATED
  const tenantDone = input.tenantLifecycle === 'ACTIVE';
  steps.push({
    id: 'TENANT_CREATED',
    titleKey: 'onboarding.checklist.tenantCreated',
    descriptionKey: 'onboarding.checklist.tenantCreatedDesc',
    status: tenantDone ? 'DONE' : 'PENDING',
    blocking: !tenantDone,
  });

  // 2. ROLE_ASSIGNED — locked if tenant not done
  const roleDone = input.hasRole;
  steps.push({
    id: 'ROLE_ASSIGNED',
    titleKey: 'onboarding.checklist.roleAssigned',
    descriptionKey: 'onboarding.checklist.roleAssignedDesc',
    status: !tenantDone ? 'LOCKED' : roleDone ? 'DONE' : 'PENDING',
    blocking: !roleDone,
  });

  // 3. MEMBERSHIP_CONFIGURED — locked if role not done
  const membershipConfigured = input.membershipCount > 0;
  const membershipUnlocked = tenantDone && roleDone;
  steps.push({
    id: 'MEMBERSHIP_CONFIGURED',
    titleKey: 'onboarding.checklist.membershipConfigured',
    descriptionKey: 'onboarding.checklist.membershipConfiguredDesc',
    status: !membershipUnlocked ? 'LOCKED' : membershipConfigured ? 'DONE' : 'PENDING',
    blocking: !membershipConfigured,
  });

  // 4. FIRST_MEMBER_APPROVED — locked if membership not configured
  const memberApproved = input.membershipCount >= 1;
  const memberUnlocked = membershipUnlocked && membershipConfigured;
  steps.push({
    id: 'FIRST_MEMBER_APPROVED',
    titleKey: 'onboarding.checklist.firstMemberApproved',
    descriptionKey: 'onboarding.checklist.firstMemberApprovedDesc',
    status: !memberUnlocked ? 'LOCKED' : memberApproved ? 'DONE' : 'PENDING',
    blocking: !memberApproved,
  });

  // 5. BILLING_ACTIVE — locked if first member not approved
  const billingDone = input.billingStatus === 'ACTIVE';
  const billingUnlocked = memberUnlocked && memberApproved;
  steps.push({
    id: 'BILLING_ACTIVE',
    titleKey: 'onboarding.checklist.billingActive',
    descriptionKey: 'onboarding.checklist.billingActiveDesc',
    status: !billingUnlocked ? 'LOCKED' : billingDone ? 'DONE' : 'PENDING',
    blocking: !billingDone,
  });

  // 6. SECURITY_OK — never locked, always evaluable
  const securityDone = input.securityPosture === 'OK';
  const securityCritical = input.securityPosture === 'CRITICAL';
  steps.push({
    id: 'SECURITY_OK',
    titleKey: 'onboarding.checklist.securityOk',
    descriptionKey: 'onboarding.checklist.securityOkDesc',
    status: securityDone ? 'DONE' : 'PENDING',
    blocking: securityCritical,
  });

  const doneCount = steps.filter(s => s.status === 'DONE').length;
  const completionPercent = Math.floor((doneCount / steps.length) * 100);

  return {
    steps,
    completionPercent,
    isFullyActivated: completionPercent === 100,
  };
}
