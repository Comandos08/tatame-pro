import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, XCircle, CreditCard, ExternalLink, X, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/i18n/formatters';
import { safeStripeRedirect } from '@/lib/stripeRedirect';
import { toast } from 'sonner';

export function TenantStatusBanner() {
  const status = useTenantStatus();
  const { tenant } = useTenant();
  const { t, locale } = useI18n();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { hasStripeCustomer } = status;

  // Smart CTA: for tenants without a Stripe customer yet (trial, pre-paid),
  // route to the checkout/subscription flow. For existing Stripe customers,
  // open the customer portal. Previously this always called the portal,
  // which 404s for trial tenants and traps users in the 10/hour rate limit.
  const handleBillingCTA = async () => {
    if (!tenant?.id) return;

    setIsOpeningPortal(true);
    try {
      if (hasStripeCustomer) {
        const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
          body: { tenant_id: tenant.id },
        });
        if (error) throw error;
        if (data?.url) {
          window.open(data.url, '_blank');
        } else {
          throw new Error('Portal URL not returned');
        }
      } else {
        const { data, error } = await supabase.functions.invoke('create-tenant-subscription', {
          body: { tenantId: tenant.id },
        });
        if (error) throw error;
        if (data?.url && !safeStripeRedirect(data.url)) {
          toast.error(t('billing.invalidCheckoutUrl'));
        }
      }
    } catch (err) {
      logger.error('[TenantStatusBanner] Billing CTA failed:', err);
      toast.error(hasStripeCustomer ? t('billing.openPortalError') : t('billing.error.checkoutFailed'));
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return '';
    return formatDate(date, locale, { dateStyle: 'long' });
  };

  // Don't show if dismissed, loading, or user can't see
  if (dismissed || status.isLoading || !status.canSeeBanner) return null;

  // Don't show billing banner during onboarding — no billing record exists yet
  if (tenant?.status === 'SETUP') return null;

  // Determine what to show
  let variant: 'default' | 'destructive';
  let icon: React.ElementType;
  let message: string;
  let showCTA: boolean;
  let canDismiss = true;

  if (status.billingState?.isBlocked) {
    variant = 'destructive';
    icon = XCircle;
    message = t('tenantStatus.blocked');
    showCTA = true;
    canDismiss = false;
  } else if (status.billingState?.isReadOnly) {
    variant = 'destructive';
    icon = AlertTriangle;
    message = t('tenantStatus.billingIssue');
    showCTA = true;
    canDismiss = false;
  } else if (status.billingState?.isTrialExpired) {
    variant = 'destructive';
    icon = XCircle;
    message = t('tenantStatus.trialExpired');
    showCTA = true;
    canDismiss = false;
  } else if (status.isTrialEndingSoon) {
    variant = 'destructive';
    icon = AlertTriangle;
    message = t('tenantStatus.trialEndingSoon').replace(
      '{days}',
      String(status.daysToTrialEnd)
    );
    showCTA = true;
  } else if (status.billingState?.isTrialActive && status.daysToTrialEnd !== null && status.daysToTrialEnd > 7) {
    // Neutral trial message
    variant = 'default';
    icon = Clock;
    message = t('tenantStatus.onTrial').replace('{date}', formatDateDisplay(status.currentPeriodEnd));
    showCTA = false;
  } else {
    // No banner needed
    return null;
  }

  const Icon = icon;
  const tenantSlug = tenant?.slug;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-4"
      >
        <Alert variant={variant} className="relative">
          <div className="flex items-start gap-3">
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <AlertDescription className="text-sm">
                {message}
              </AlertDescription>
              {showCTA && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    variant={variant === 'destructive' ? 'outline' : 'default'}
                    size="sm"
                    onClick={handleBillingCTA}
                    disabled={isOpeningPortal}
                    className={variant === 'destructive' ? 'border-destructive-foreground/30 hover:bg-destructive-foreground/10' : ''}
                  >
                    {isOpeningPortal ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    {hasStripeCustomer
                      ? t('tenantStatus.manageBilling')
                      : t('tenantStatus.activateBilling')}
                  </Button>
                  {tenantSlug && (
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className={variant === 'destructive' ? 'text-destructive-foreground hover:bg-destructive-foreground/10' : ''}
                    >
                      <Link to={`/${tenantSlug}/app/billing`}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('tenantStatus.viewDetails')}
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
            {canDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setDismissed(true)}
                aria-label={t('common.close')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Alert>
      </motion.div>
    </AnimatePresence>
  );
}
