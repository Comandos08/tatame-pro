import { describe, it, expect } from 'vitest';
import {
  canTenantOperate,
  isTenantSuspended,
  isTenantInSetup,
  isTenantTerminal,
  isMembershipValid,
  isMembershipPending,
  isMembershipTerminal,
  isSubscriptionBlocking,
  isSubscriptionDegraded,
  isSubscriptionHealthy,
  isBillingTrialActive,
  isBillingTrialExpired,
  isBillingPendingDelete,
  areSensitiveActionsBlocked,
} from './stateGuards';

import type { TenantLifecycleStatus, MembershipStatus, SubscriptionStatus } from './stateDefinitions';
import type { BillingStatus } from '@/lib/billing';

// ============================================================================
// TENANT GUARDS
// ============================================================================
describe('Tenant Guards', () => {
  const allStatuses: TenantLifecycleStatus[] = ['SETUP', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'DELETED'];

  it('canTenantOperate returns true ONLY for ACTIVE', () => {
    allStatuses.forEach(s => {
      expect(canTenantOperate(s)).toBe(s === 'ACTIVE');
    });
  });

  it('isTenantSuspended returns true ONLY for SUSPENDED', () => {
    allStatuses.forEach(s => {
      expect(isTenantSuspended(s)).toBe(s === 'SUSPENDED');
    });
  });

  it('isTenantInSetup returns true ONLY for SETUP', () => {
    allStatuses.forEach(s => {
      expect(isTenantInSetup(s)).toBe(s === 'SETUP');
    });
  });

  it('isTenantTerminal returns true for INACTIVE and DELETED', () => {
    allStatuses.forEach(s => {
      expect(isTenantTerminal(s)).toBe(s === 'INACTIVE' || s === 'DELETED');
    });
  });
});

// ============================================================================
// MEMBERSHIP GUARDS
// ============================================================================
describe('Membership Guards', () => {
  const allStatuses: MembershipStatus[] = ['PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'];

  it('isMembershipValid returns true ONLY for ACTIVE', () => {
    allStatuses.forEach(s => {
      expect(isMembershipValid(s)).toBe(s === 'ACTIVE');
    });
  });

  it('isMembershipPending returns true ONLY for PENDING', () => {
    allStatuses.forEach(s => {
      expect(isMembershipPending(s)).toBe(s === 'PENDING');
    });
  });

  it('isMembershipTerminal returns true for EXPIRED and CANCELLED', () => {
    allStatuses.forEach(s => {
      expect(isMembershipTerminal(s)).toBe(s === 'EXPIRED' || s === 'CANCELLED');
    });
  });
});

// ============================================================================
// SUBSCRIPTION GUARDS
// ============================================================================
describe('Subscription Guards', () => {
  const allStatuses: SubscriptionStatus[] = ['INCOMPLETE', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'];

  it('isSubscriptionBlocking returns true for SUSPENDED and CANCELLED', () => {
    allStatuses.forEach(s => {
      expect(isSubscriptionBlocking(s)).toBe(s === 'SUSPENDED' || s === 'CANCELLED');
    });
  });

  it('isSubscriptionDegraded returns true ONLY for PAST_DUE', () => {
    allStatuses.forEach(s => {
      expect(isSubscriptionDegraded(s)).toBe(s === 'PAST_DUE');
    });
  });

  it('isSubscriptionHealthy returns true for ACTIVE and TRIAL', () => {
    allStatuses.forEach(s => {
      expect(isSubscriptionHealthy(s)).toBe(s === 'ACTIVE' || s === 'TRIAL');
    });
  });
});

// ============================================================================
// BILLING GUARDS
// ============================================================================
describe('Billing Guards', () => {
  const allStatuses: BillingStatus[] = [
    'ACTIVE', 'TRIALING', 'TRIAL_EXPIRED', 'PENDING_DELETE',
    'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE'
  ];

  it('isBillingTrialActive returns true ONLY for TRIALING', () => {
    allStatuses.forEach(s => {
      expect(isBillingTrialActive(s)).toBe(s === 'TRIALING');
    });
  });

  it('isBillingTrialExpired returns true ONLY for TRIAL_EXPIRED', () => {
    allStatuses.forEach(s => {
      expect(isBillingTrialExpired(s)).toBe(s === 'TRIAL_EXPIRED');
    });
  });

  it('isBillingPendingDelete returns true ONLY for PENDING_DELETE', () => {
    allStatuses.forEach(s => {
      expect(isBillingPendingDelete(s)).toBe(s === 'PENDING_DELETE');
    });
  });

  it('areSensitiveActionsBlocked returns true for TRIAL_EXPIRED and PENDING_DELETE', () => {
    allStatuses.forEach(s => {
      expect(areSensitiveActionsBlocked(s)).toBe(s === 'TRIAL_EXPIRED' || s === 'PENDING_DELETE');
    });
  });
});
