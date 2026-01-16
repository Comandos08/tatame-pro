import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface TenantStatusInfo {
  isOnTrial: boolean;
  daysToTrialEnd: number | null;
  isTrialEndingSoon: boolean;
  isTrialExpired: boolean;
  isBlocked: boolean;
  hasBillingIssue: boolean;
  billingStatus: string | null;
  currentPeriodEnd: Date | null;
  planName: string | null;
  canSeeBanner: boolean;
}

interface TenantBillingData {
  status: string;
  plan_name: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  trial_end_notification_sent: boolean | null;
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
      hasRole('STAFF_ORGANIZACAO', tenant.id) ||
      isGlobalSuperadmin)
  );

  const { data: billing, isLoading } = useQuery({
    queryKey: ['tenant-billing-status-hook', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const { data, error } = await supabase
        .from('tenant_billing')
        .select('status, plan_name, current_period_end, stripe_customer_id, trial_end_notification_sent')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error) throw error;
      return data as TenantBillingData | null;
    },
    enabled: !!tenant?.id && canSeeBanner,
    staleTime: 60000, // Cache for 1 minute
  });

  // Calculate status flags
  const isOnTrial = billing?.status === 'TRIALING';
  const currentPeriodEnd = billing?.current_period_end
    ? new Date(billing.current_period_end)
    : null;

  const daysToTrialEnd = (() => {
    if (!isOnTrial || !currentPeriodEnd) return null;
    const now = new Date();
    const diffTime = currentPeriodEnd.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  })();

  const isTrialEndingSoon =
    isOnTrial && daysToTrialEnd !== null && daysToTrialEnd <= TRIAL_WARNING_DAYS && daysToTrialEnd > 0;

  const isTrialExpired = isOnTrial && daysToTrialEnd !== null && daysToTrialEnd <= 0;

  const hasBillingIssue = Boolean(
    billing?.status && ['PAST_DUE', 'UNPAID', 'INCOMPLETE'].includes(billing.status)
  );

  const isBlocked = !tenant?.isActive || billing?.status === 'CANCELED';

  return {
    isOnTrial,
    daysToTrialEnd,
    isTrialEndingSoon,
    isTrialExpired,
    isBlocked,
    hasBillingIssue,
    billingStatus: billing?.status || null,
    currentPeriodEnd,
    planName: billing?.plan_name || null,
    canSeeBanner,
    isLoading,
  };
}
