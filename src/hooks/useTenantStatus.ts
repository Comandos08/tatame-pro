/**
 * ⚠️ SRP CONTRACT (PI U5)
 * - This hook DOES NOT decide rules
 * - This hook DOES NOT derive states
 * - All rules live in lib/state/*
 */

import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { resolveTenantBillingState, type TenantBillingState, type BillingStatus } from '@/lib/billing';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import { deriveTrialPresentationState } from '@/lib/state/stateSelectors';
import type { AsyncState } from '@/types/async';

export interface TenantStatusInfo {
  daysToTrialEnd: number | null;
  isTrialEndingSoon: boolean;
  billingStatus: string | null;
  currentPeriodEnd: Date | null;
  planName: string | null;
  canSeeBanner: boolean;
  billingState: TenantBillingState | null;
  asyncState: AsyncState<TenantBillingData>;
}

interface TenantBillingData {
  status: string;
  plan_name: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  trial_end_notification_sent: boolean | null;
  is_manual_override: boolean | null;
  override_reason: string | null;
  override_at: string | null;
  trial_expires_at: string | null;
  grace_period_ends_at: string | null;
  scheduled_delete_at: string | null;
}

const TRIAL_WARNING_DAYS = 7;

export function useTenantStatus(): TenantStatusInfo & { isLoading: boolean } {
  const { tenant } = useTenant();
  const { hasRole, currentUser, isGlobalSuperadmin } = useCurrentUser();

  // Check if user can see billing banners (admin/staff only, not athletes)
  const canSeeBanner = Boolean(
    tenant?.id &&
    currentUser &&
    (hasRole('ADMIN_TENANT', tenant.id) ||
      isGlobalSuperadmin)
  );

  const { data: billing, isLoading } = useQuery({
    queryKey: ['tenant-billing-status-hook', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const { data, error } = await supabase
        .from('tenant_billing')
        .select('status, plan_name, current_period_end, stripe_customer_id, trial_end_notification_sent, is_manual_override, override_reason, override_at, trial_expires_at, grace_period_ends_at, scheduled_delete_at')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error) throw error;
      return data as TenantBillingData | null;
    },
    enabled: !!tenant?.id && canSeeBanner,
    staleTime: 60000, // Cache for 1 minute
  });

  // Use resolver for billing state with trial data
  const billingState = resolveTenantBillingState(
    billing ? {
      status: billing.status,
      is_manual_override: billing.is_manual_override ?? false,
      override_reason: billing.override_reason,
      override_at: billing.override_at,
      trial_expires_at: billing.trial_expires_at,
      grace_period_ends_at: billing.grace_period_ends_at,
      scheduled_delete_at: billing.scheduled_delete_at,
    } : null,
    tenant ? { is_active: tenant.isActive } : null
  );

  // PI U5 — Delegate presentation derivation to pure selector
  const trialPresentation = deriveTrialPresentationState(
    billingState.status as BillingStatus | null,
    billing?.current_period_end ? new Date(billing.current_period_end) : null,
    TRIAL_WARNING_DAYS,
  );

  const { isTrialActive, isTrialEndingSoon, daysToTrialEnd } = trialPresentation;
  const currentPeriodEnd = billing?.current_period_end
    ? new Date(billing.current_period_end)
    : null;

  const asyncState: AsyncState<TenantBillingData> = normalizeAsyncState({
    data: billing,
    isLoading,
    isError: false,
    error: null,
  });

  return {
    daysToTrialEnd,
    isTrialEndingSoon,
    billingStatus: billingState.status,
    currentPeriodEnd,
    planName: billing?.plan_name || null,
    canSeeBanner,
    billingState,
    isLoading,
    asyncState,
  };
}
