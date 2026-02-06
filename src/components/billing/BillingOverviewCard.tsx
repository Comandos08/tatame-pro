/**
 * BillingOverviewCard — Display current billing state with CTAs
 * 
 * P3.3 — Billing UX Advanced Layer
 * 
 * RULES:
 * - Pure presentation component
 * - NO automatic navigation
 * - CTAs via explicit onClick handlers
 * - Uses existing billing state from useTenantStatus
 */

import React from 'react';
import { Clock, CheckCircle, AlertTriangle, AlertCircle, Trash2, XCircle, CreditCard, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { resolveBillingCTA, resolveBillingStatusVariant } from './billingCtaResolver';
import type { BillingStatus } from '@/lib/billing/resolveTenantBillingState';

interface BillingOverviewCardProps {
  className?: string;
}

const statusIcons: Record<BillingStatus, React.ElementType> = {
  TRIALING: Clock,
  TRIAL_EXPIRED: AlertTriangle,
  ACTIVE: CheckCircle,
  PAST_DUE: AlertCircle,
  PENDING_DELETE: Trash2,
  CANCELED: XCircle,
  UNPAID: AlertCircle,
  INCOMPLETE: CreditCard,
};

const variantStyles = {
  success: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/20',
  },
  warning: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/20',
  },
  destructive: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/20',
  },
  muted: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
  },
};

export function BillingOverviewCard({ className }: BillingOverviewCardProps) {
  const { tenant } = useTenant();
  const { billingState, daysToTrialEnd, planName, isLoading } = useTenantStatus();
  const { t } = useI18n();
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  // Don't render for non-ACTIVE tenants (still in SETUP)
  if (tenant?.status !== 'ACTIVE') {
    return null;
  }

  if (isLoading) {
    return (
      <Card className={cn('animate-pulse', className)}>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="h-10 w-full bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const status = billingState?.status || 'INCOMPLETE';
  const variant = resolveBillingStatusVariant(status);
  const cta = resolveBillingCTA(status);
  const styles = variantStyles[variant];
  const StatusIcon = statusIcons[status] || CreditCard;

  const getStatusDescription = (): string => {
    switch (status) {
      case 'TRIALING':
        return t('billing.overview.trialDaysLeft', { days: String(daysToTrialEnd ?? 0) });
      case 'TRIAL_EXPIRED':
        return t('billing.overview.trialExpired');
      case 'ACTIVE':
        return t('billing.overview.active', { plan: planName || 'Growth' });
      case 'PAST_DUE':
        return t('billing.overview.pastDue');
      case 'PENDING_DELETE':
        return t('billing.overview.pendingDelete');
      case 'CANCELED':
        return t('billing.overview.canceled');
      default:
        return t('billing.overview.unknown');
    }
  };

  const handleCTAClick = async () => {
    if (!cta || !tenant?.id) return;

    if (cta.action === 'upgrade' || cta.action === 'reactivate') {
      // Redirect to Stripe checkout
      setIsRedirecting(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-tenant-subscription', {
          body: { tenantId: tenant.id, planType: 'monthly' },
        });

        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
        }
      } catch (err) {
        console.error('Failed to create checkout session:', err);
        toast.error(t('billing.error.checkoutFailed'));
        setIsRedirecting(false);
      }
    } else if (cta.action === 'manage') {
      // Open Stripe customer portal
      setIsRedirecting(true);
      try {
        const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
          body: { tenantId: tenant.id },
        });

        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
        }
      } catch (err) {
        console.error('Failed to open customer portal:', err);
        toast.error(t('billing.error.portalFailed'));
        setIsRedirecting(false);
      }
    } else if (cta.action === 'contact') {
      // Open support email
      window.location.href = 'mailto:suporte@tatame.pro';
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className={cn('border-b', styles.border)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-full', styles.bg)}>
              <StatusIcon className={cn('h-5 w-5', styles.text)} />
            </div>
            <div>
              <CardTitle className="text-lg">{t('billing.overview.title')}</CardTitle>
              <CardDescription>{getStatusDescription()}</CardDescription>
            </div>
          </div>
          <Badge variant={variant === 'success' ? 'default' : variant === 'destructive' ? 'destructive' : 'secondary'}>
            {t(`billing.status.${status.toLowerCase()}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          {planName && (
            <p className="text-sm text-muted-foreground">
              {t('billing.overview.currentPlan')}: <span className="font-medium">{planName}</span>
            </p>
          )}
          {cta && (
            <Button
              variant={cta.variant}
              onClick={handleCTAClick}
              disabled={isRedirecting}
              className="w-full sm:w-auto"
            >
              {isRedirecting ? (
                <span className="animate-pulse">{t('common.loading')}</span>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t(cta.labelKey)}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default BillingOverviewCard;
