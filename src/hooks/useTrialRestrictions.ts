/**
 * useTrialRestrictions - Centralized hook for trial-based action restrictions
 * 
 * This hook determines whether sensitive actions can be performed based on
 * the tenant's billing status. During TRIAL_EXPIRED, most administrative
 * actions are blocked even for admins and impersonating superadmins.
 * 
 * RULES:
 * - TRIALING + ACTIVE: All actions allowed
 * - TRIAL_EXPIRED: View-only, no sensitive actions
 * - PENDING_DELETE: Fully blocked (TenantBlockedScreen shown)
 */

import { useTenantStatus } from './useTenantStatus';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export interface TrialRestrictions {
  // Specific action permissions
  canApproveMemberships: boolean;
  canRejectMemberships: boolean;
  canCreateEvents: boolean;
  canIssueDiplomas: boolean;
  canAddAthletes: boolean;
  canRegisterGradings: boolean;
  canManageAcademies: boolean;
  canManageCoaches: boolean;
  
  // State flags
  isRestricted: boolean;
  isPendingDelete: boolean;
  isImpersonatingRestricted: boolean;
  
  // Reason for restrictions (for UI messages)
  restrictionReason: 'trial_expired' | 'pending_delete' | null;
}

export function useTrialRestrictions(): TrialRestrictions {
  const { billingState } = useTenantStatus();
  const { isImpersonating } = useImpersonation();
  
  const isTrialRestricted = billingState?.status === 'TRIAL_EXPIRED';
  const isPendingDelete = billingState?.status === 'PENDING_DELETE';
  
  // Actions are blocked during trial expiration AND pending delete
  const actionsBlocked = isTrialRestricted || isPendingDelete;
  
  return {
    // Specific action permissions
    canApproveMemberships: !actionsBlocked,
    canRejectMemberships: !actionsBlocked,
    canCreateEvents: !actionsBlocked,
    canIssueDiplomas: !actionsBlocked,
    canAddAthletes: !actionsBlocked,
    canRegisterGradings: !actionsBlocked,
    canManageAcademies: !actionsBlocked,
    canManageCoaches: !actionsBlocked,
    
    // State flags
    isRestricted: isTrialRestricted,
    isPendingDelete,
    isImpersonatingRestricted: isImpersonating && isTrialRestricted,
    
    // Reason for restrictions
    restrictionReason: isPendingDelete 
      ? 'pending_delete' 
      : isTrialRestricted 
        ? 'trial_expired' 
        : null,
  };
}
