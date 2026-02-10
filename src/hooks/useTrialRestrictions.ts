/**
 * ⚠️ SRP CONTRACT (PI U5)
 * - This hook DOES NOT decide rules
 * - This hook DOES NOT derive states
 * - All rules live in lib/state/*
 *
 * useTrialRestrictions - Centralized hook for trial-based action restrictions
 * 
 * Reads billing state and delegates restriction logic to pure guards.
 */

import { useTenantStatus } from './useTenantStatus';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import {
  isBillingTrialExpired,
  isBillingPendingDelete,
  areSensitiveActionsBlocked,
} from '@/lib/state/stateGuards';
import type { BillingStatus } from '@/lib/billing';

export interface TrialRestrictions {
  canApproveMemberships: boolean;
  canRejectMemberships: boolean;
  canCreateEvents: boolean;
  canIssueDiplomas: boolean;
  canAddAthletes: boolean;
  canRegisterGradings: boolean;
  canManageAcademies: boolean;
  canManageCoaches: boolean;
  isRestricted: boolean;
  isPendingDelete: boolean;
  isImpersonatingRestricted: boolean;
  restrictionReason: 'trial_expired' | 'pending_delete' | null;
}

export function useTrialRestrictions(): TrialRestrictions {
  const { billingState } = useTenantStatus();
  const { isImpersonating } = useImpersonation();

  const status = (billingState?.status ?? 'INCOMPLETE') as BillingStatus;

  // PI U5 — Delegate to pure guards
  const isTrialRestricted = isBillingTrialExpired(status);
  const isPendingDelete = isBillingPendingDelete(status);
  const actionsBlocked = areSensitiveActionsBlocked(status);

  return {
    canApproveMemberships: !actionsBlocked,
    canRejectMemberships: !actionsBlocked,
    canCreateEvents: !actionsBlocked,
    canIssueDiplomas: !actionsBlocked,
    canAddAthletes: !actionsBlocked,
    canRegisterGradings: !actionsBlocked,
    canManageAcademies: !actionsBlocked,
    canManageCoaches: !actionsBlocked,
    isRestricted: isTrialRestricted,
    isPendingDelete,
    isImpersonatingRestricted: isImpersonating && isTrialRestricted,
    restrictionReason: isPendingDelete
      ? 'pending_delete'
      : isTrialRestricted
        ? 'trial_expired'
        : null,
  };
}
