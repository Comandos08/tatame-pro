import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CreditCard, ExternalLink, Loader2, Mail, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { safeOpen } from '@/lib/safeOpen';

interface TenantBlockedScreenProps {
  tenantName: string;
  tenantId: string;
  hasStripeCustomer: boolean;
  billingStatus?: string;
  scheduledDeleteAt?: string;
}

export function TenantBlockedScreen({ 
  tenantName, 
  tenantId, 
  hasStripeCustomer,
  billingStatus,
  scheduledDeleteAt,
}: TenantBlockedScreenProps) {
  const { hasRole, currentUser } = useCurrentUser();
  const { t } = useI18n();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  // Capture "now" once per mount — React Compiler flags Date.now() during
  // render. Staleness of a few hours is fine for a day-granularity countdown.
  const [nowMs] = useState(() => Date.now());

  // Check if user is admin or staff
  const isAdmin = currentUser && (
    hasRole('ADMIN_TENANT', tenantId) ||
    hasRole('SUPERADMIN_GLOBAL')
  );

  // Calculate days until deletion
  const daysUntilDeletion = scheduledDeleteAt
    ? Math.max(0, Math.ceil((new Date(scheduledDeleteAt).getTime() - nowMs) / (1000 * 60 * 60 * 24)))
    : null;

  const isPendingDelete = billingStatus === 'PENDING_DELETE';

  const handleOpenCustomerPortal = async () => {
    setIsOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
        body: { tenant_id: tenantId },
      });

      if (error) throw error;
      if (data?.url) {
        safeOpen(data.url);
      } else {
        throw new Error('URL do portal não retornada');
      }
    } catch (err) {
      logger.error('Error opening customer portal:', err);
      toast.error(t('blocked.portalError'));
    } finally {
      setIsOpeningPortal(false);
    }
  };

  // PENDING_DELETE view - urgent countdown
  if (isPendingDelete && isAdmin) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-destructive/5 to-destructive/10 p-4"
        data-testid="tenant-blocked-screen"
        data-blocked-reason={billingStatus}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-lg"
        >
          <Card className="border-destructive shadow-2xl shadow-destructive/20">
            <CardHeader className="text-center pb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto mb-4 h-20 w-20 rounded-full bg-destructive/20 flex items-center justify-center"
              >
                <Trash2 className="h-10 w-10 text-destructive" />
              </motion.div>
              <CardTitle className="text-2xl font-display text-destructive">
                {t('billing.pendingDelete.title', { days: String(daysUntilDeletion ?? 0) })}
              </CardTitle>
              <CardDescription className="text-base mt-2 font-semibold">
                {tenantName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-destructive/10 rounded-lg p-4 border border-destructive/30">
                <p className="text-center text-destructive font-medium">
                  ⚠️ {t('billing.pendingDelete.lastChance')}
                </p>
                <p className="text-center text-sm text-muted-foreground mt-2">
                  {t('billing.pendingDelete.dataWarning')}
                </p>
              </div>

              <div className="text-center text-muted-foreground text-sm">
                <p>{t('billing.pendingDelete.description')}</p>
              </div>

              {/* Countdown display */}
              {daysUntilDeletion !== null && (
                <div className="flex justify-center" data-testid="delete-countdown">
                  <div className="text-center bg-muted rounded-lg p-4">
                    <div className="text-4xl font-bold text-destructive">
                      {daysUntilDeletion}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {daysUntilDeletion === 1 ? 'dia restante' : 'dias restantes'}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {hasStripeCustomer && (
                  <Button
                    className="w-full bg-destructive hover:bg-destructive/90"
                    size="lg"
                    onClick={handleOpenCustomerPortal}
                    disabled={isOpeningPortal}
                    data-testid="billing-urgent-cta"
                  >
                    {isOpeningPortal ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    {t('billing.pendingDelete.urgentCta')}
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <a href="mailto:suporte@tatame.pro">
                    <Mail className="h-4 w-4 mr-2" />
                    {t('blocked.contactSupportBtn')}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Admin view - shows management options
  if (isAdmin) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4"
        data-testid="tenant-blocked-screen"
        data-blocked-reason={billingStatus ?? 'BLOCKED'}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-lg"
        >
          <Card className="border-destructive/50 shadow-lg">
            <CardHeader className="text-center pb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto mb-4 h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center"
              >
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </motion.div>
              <CardTitle className="text-2xl font-display">
                {t('blocked.inactiveSubscription')}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {tenantName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center text-muted-foreground">
                <p>
                  {t('blocked.accessSuspended')}
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {t('blocked.toRegularize')}
                </h4>
                <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                  <li>• {t('blocked.updatePaymentMethod')}</li>
                  <li>• {t('blocked.makePendingPayment')}</li>
                  <li>• {t('blocked.contactSupport')}</li>
                </ul>
              </div>

              <div className="space-y-3">
                {hasStripeCustomer && (
                  <Button
                    className="w-full"
                    onClick={handleOpenCustomerPortal}
                    disabled={isOpeningPortal}
                  >
                    {isOpeningPortal ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    {t('blocked.manageSubscription')}
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <a href="mailto:suporte@tatame.pro">
                    <Mail className="h-4 w-4 mr-2" />
                    {t('blocked.contactSupportBtn')}
                  </a>
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                {t('blocked.afterRegularization')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Non-admin view - simple message
  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4"
      data-testid="tenant-blocked-screen"
      data-blocked-reason={billingStatus ?? 'BLOCKED'}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center"
            >
              <Clock className="h-8 w-8 text-muted-foreground" />
            </motion.div>
            <CardTitle className="text-xl font-display">
              {t('blocked.temporarilyUnavailable')}
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {tenantName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center text-muted-foreground text-sm">
              <p>
                {t('blocked.orgTemporarilyUnavailable')}
              </p>
              <p className="mt-2">
                {t('blocked.tryLaterOrContact')}
              </p>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.location.reload()}
              >
                {t('blocked.tryAgain')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
