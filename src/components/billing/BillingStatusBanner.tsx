import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle, Clock, CreditCard, XCircle, ExternalLink, Loader2, FileText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { StatusBadge, StatusType } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/i18n/formatters';
import { toast } from 'sonner';

// Map billing status to StatusBadge status type
const billingStatusMap: Record<string, StatusType> = {
  ACTIVE: 'ACTIVE',
  TRIALING: 'TRIALING',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELLED',
  INCOMPLETE: 'INCOMPLETE',
  UNPAID: 'UNPAID',
};

interface TenantBilling {
  id: string;
  status: string;
  plan_name: string;
  current_period_end: string | null;
  cancel_at: string | null;
  stripe_customer_id: string | null;
  trial_end_notification_sent: boolean | null;
}

export function BillingStatusBanner() {
  const { tenant } = useTenant();
  const { hasRole, currentUser } = useCurrentUser();
  const { t, locale } = useI18n();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const canSeeBilling = tenant?.id && currentUser && (
    hasRole('ADMIN_TENANT', tenant.id) || 
    hasRole('SUPERADMIN_GLOBAL')
  );

  const { data: billing, isLoading } = useQuery({
    queryKey: ['tenant-billing-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      const { data, error } = await supabase
        .from('tenant_billing')
        .select('id, status, plan_name, current_period_end, cancel_at, stripe_customer_id, trial_end_notification_sent')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as TenantBilling | null;
    },
    enabled: !!tenant?.id && !!canSeeBilling,
  });

  const handleOpenCustomerPortal = async () => {
    if (!tenant?.id) return;
    
    setIsOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
        body: { tenant_id: tenant.id },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('URL do portal não retornada');
      }
    } catch (err) {
      console.error('Error opening customer portal:', err);
      toast.error(t('billing.openPortalError'));
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const formatDisplayDate = (dateString: string | null) => {
    return formatDate(dateString, locale, { dateStyle: 'long' });
  };

  const tenantSlug = tenant?.slug;
  if (!canSeeBilling) return null;
  if (isLoading) return null;

  if (!billing) {
    return (
      <Alert variant="destructive" className="mb-6">
        <CreditCard className="h-4 w-4" />
        <AlertTitle>{t('billing.notConfigured')}</AlertTitle>
        <AlertDescription>
          {t('billing.notConfiguredDesc')}
        </AlertDescription>
      </Alert>
    );
  }

  const statusConfig: Record<string, { 
    variant: 'default' | 'destructive'; 
    icon: React.ElementType; 
    titleKey: string;
    showBanner: boolean;
  }> = {
    ACTIVE: { 
      variant: 'default', 
      icon: CheckCircle, 
      titleKey: 'billing.subscriptionActive',
      showBanner: false,
    },
    TRIALING: { 
      variant: 'default', 
      icon: Clock, 
      titleKey: 'billing.subscriptionTrialing',
      showBanner: true,
    },
    PAST_DUE: { 
      variant: 'destructive', 
      icon: AlertCircle, 
      titleKey: 'billing.subscriptionPastDue',
      showBanner: true,
    },
    CANCELED: { 
      variant: 'destructive', 
      icon: XCircle, 
      titleKey: 'billing.subscriptionCanceled',
      showBanner: true,
    },
    INCOMPLETE: { 
      variant: 'destructive', 
      icon: Clock, 
      titleKey: 'billing.subscriptionIncomplete',
      showBanner: true,
    },
    UNPAID: { 
      variant: 'destructive', 
      icon: AlertCircle, 
      titleKey: 'billing.subscriptionUnpaid',
      showBanner: true,
    },
  };

  const config = statusConfig[billing.status];
  
  if (!config?.showBanner) return null;

  const Icon = config.icon;
  const periodEnd = formatDisplayDate(billing.current_period_end);

  // Check if trial is ending soon (within 3 days)
  const isTrialEndingSoon = () => {
    if (billing.status !== 'TRIALING' || !billing.current_period_end) return false;
    const endDate = new Date(billing.current_period_end);
    const now = new Date();
    const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays > 0;
  };

  const trialEndingSoon = isTrialEndingSoon();

  const getDescription = () => {
    switch (billing.status) {
      case 'TRIALING':
        if (trialEndingSoon) {
          return t('billing.trialEndingSoon').replace('{date}', periodEnd || '');
        }
        return t('billing.trialEndsAt').replace('{date}', periodEnd || '');
      case 'PAST_DUE':
        return t('billing.pastDueDesc');
      case 'CANCELED':
        return t('billing.canceledDesc');
      case 'INCOMPLETE':
        return t('billing.incompleteDesc');
      case 'UNPAID':
        return t('billing.unpaidDesc');
      default:
        return '';
    }
  };

  // Show manage button for trialing (to add payment method) or payment issues
  const canManagePayment = billing.stripe_customer_id && 
    ['TRIALING', 'PAST_DUE', 'INCOMPLETE', 'UNPAID'].includes(billing.status);

  // Determine alert variant based on trial ending soon
  const alertVariant = trialEndingSoon ? 'destructive' : config.variant;

  return (
    <Alert 
      variant={alertVariant} 
      className="mb-6"
      data-testid="billing-status-banner"
      data-billing-status={billing.status}
    >
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {trialEndingSoon ? t('billing.trialEndingSoonTitle') : t(config.titleKey as any)}
        <StatusBadge 
          status={billingStatusMap[billing.status] || 'neutral'} 
          label={billing.plan_name}
          size="sm"
          className="ml-2"
        />
      </AlertTitle>
      <AlertDescription>
        <p>{getDescription()}</p>
        {periodEnd && billing.status !== 'CANCELED' && (
          <span className="block mt-1 text-sm opacity-80">
            {t('billing.validUntil').replace('{date}', periodEnd)}
          </span>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {canManagePayment && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenCustomerPortal}
              disabled={isOpeningPortal}
              data-testid="billing-manage-btn"
            >
              {isOpeningPortal ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              {billing.status === 'TRIALING' ? t('billing.manageSubscription') : t('billing.managePayment')}
            </Button>
          )}
          {tenantSlug && (
            <Button
              variant="ghost"
              size="sm"
              asChild
            >
              <Link to={`/${tenantSlug}/app/billing`}>
                <FileText className="h-4 w-4 mr-2" />
                {t('billing.viewInvoiceHistory')}
              </Link>
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
