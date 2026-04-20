/**
 * TrialStatusBanner - Progressive warning banner for trial tenants
 * 
 * Shows different banners based on trial status:
 * - TRIALING (D >= 4): Neutral info banner
 * - TRIALING (D <= 3): Warning banner with urgency
 * - TRIAL_EXPIRED: Destructive banner with strong CTA
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, AlertTriangle, XCircle, CreditCard, X, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { logger } from '@/lib/logger';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { safeStripeRedirect } from '@/lib/stripeRedirect';
import { toast } from 'sonner';

export function TrialStatusBanner() {
  const status = useTenantStatus();
  const { tenant } = useTenant();
  const { t } = useI18n();
  const { isImpersonating } = useImpersonation();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { hasStripeCustomer } = status;

  // Smart CTA: route trial tenants without a Stripe customer to the
  // checkout flow (create-tenant-subscription) instead of the portal,
  // which would 404 and still consume the 10/hour rate-limit budget.
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
      logger.error('[TrialStatusBanner] Billing CTA failed:', err);
      toast.error(hasStripeCustomer ? t('billing.openPortalError') : t('billing.error.checkoutFailed'));
    } finally {
      setIsOpeningPortal(false);
    }
  };

  // Don't show if dismissed, loading, or user can't see
  if (dismissed || status.isLoading || !status.canSeeBanner) return null;

  const billingStatus = status.billingState?.status;
  const daysRemaining = status.daysToTrialEnd;

  // Determine what to show based on billing status
  let variant: 'default' | 'destructive';
  let icon: React.ElementType;
  let message: string;
  let showCTA: boolean;
  let canDismiss: boolean;
  let isUrgent = false;

  if (billingStatus === 'TRIAL_EXPIRED') {
    // Grace period - actions blocked
    variant = 'destructive';
    icon = XCircle;
    message = t('trial.expired');
    showCTA = true;
    canDismiss = false;
    isUrgent = true;
  } else if (billingStatus === 'TRIALING') {
    if (daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0) {
      // Urgent - trial ending soon
      variant = 'destructive';
      icon = AlertTriangle;
      message = t('trial.expiringSoon', { days: String(daysRemaining) });
      showCTA = true;
      canDismiss = true;
      isUrgent = true;
    } else if (daysRemaining !== null && daysRemaining > 3) {
      // Normal trial info
      variant = 'default';
      icon = Clock;
      message = t('trial.daysRemaining', { days: String(daysRemaining) });
      showCTA = false;
      canDismiss = true;
    } else {
      // No banner needed for trial with unknown days
      return null;
    }
  } else {
    // No trial-related banner for other statuses
    return null;
  }

  // Special message for superadmin impersonating restricted tenant
  if (isImpersonating && billingStatus === 'TRIAL_EXPIRED') {
    message = t('trial.impersonatingRestricted');
  }

  const Icon = icon;

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
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${isUrgent ? 'animate-pulse' : ''}`} />
            <div className="flex-1 min-w-0">
              <AlertDescription className="text-sm font-medium">
                {message}
              </AlertDescription>
              {billingStatus === 'TRIAL_EXPIRED' && (
                <p className="text-sm mt-1 opacity-90">
                  {t('trial.expiredDesc')}
                </p>
              )}
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
                    {t('trial.activateNow')}
                  </Button>
                </div>
              )}
            </div>
            {canDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setDismissed(true)}
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
