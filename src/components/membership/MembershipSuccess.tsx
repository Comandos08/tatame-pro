import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Circle, Loader2, XCircle } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthenticatedHeader } from '@/components/auth/AuthenticatedHeader';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type ConfirmationStatus = 'loading' | 'success' | 'approved' | 'error';

/**
 * FX-03 — Process Timeline
 * Static visual showing 3 steps of the membership process.
 * Highlights current step based on confirmation status.
 */
function ProcessTimeline({ status, t }: { status: ConfirmationStatus; t: (key: string) => string }) {
  const steps = [
    {
      key: 'payment',
      label: t('membershipSuccess.timeline.payment'),
      done: status === 'success' || status === 'approved',
    },
    {
      key: 'validation',
      label: t('membershipSuccess.timeline.validation'),
      done: status === 'approved',
      current: status === 'success',
    },
    {
      key: 'card',
      label: t('membershipSuccess.timeline.card'),
      done: false,
      current: status === 'approved',
    },
  ];

  return (
    <div className="space-y-3 py-2">
      {steps.map((step) => (
        <div
          key={step.key}
          className={cn(
            'flex items-center gap-3 text-sm',
            step.done && 'text-emerald-600 dark:text-emerald-500',
            step.current && !step.done && 'text-primary font-medium',
            !step.done && !step.current && 'text-muted-foreground'
          )}
        >
          {step.done ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : (
            <Circle className="h-5 w-5 shrink-0" />
          )}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MembershipSuccess() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const { t } = useI18n();
  
  const [status, setStatus] = useState<ConfirmationStatus>('loading');
  const [message, setMessage] = useState('');

  const membershipId = searchParams.get('membership_id');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const confirmPayment = async () => {
      if (!membershipId || !sessionId) {
        setStatus('error');
        setMessage(t('membershipSuccess.invalidParams'));
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('confirm-membership-payment', {
          body: { sessionId, membershipId },
        });

        if (error) throw error;

        if (data?.success) {
          // Determine if membership is already approved or pending
          if (data?.membershipStatus === 'ACTIVE' || data?.membershipStatus === 'APPROVED') {
            setStatus('approved');
            setMessage(t('membershipSuccess.approvedSubtitle'));
          } else {
            setStatus('success');
            setMessage(t('membershipSuccess.successMessage'));
          }
        } else {
          setStatus('error');
          setMessage(data?.message || t('membershipSuccess.confirmError'));
        }
      } catch (error) {
        logger.error('Error confirming payment:', error);
        setStatus('error');
        setMessage(t('membershipSuccess.processError'));
      }
    };

    confirmPayment();
  }, [membershipId, sessionId, t]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AuthenticatedHeader
        {...(tenant?.name ? { tenantName: tenant.name } : {})}
        tenantLogo={tenant?.logoUrl ?? null}
        {...(tenantSlug ? { tenantSlug } : {})}
      />
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="text-center">
              {status === 'loading' && (
                <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
              )}
              {(status === 'success') && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  <CheckCircle className="h-16 w-16 mx-auto text-success mb-4" />
                </motion.div>
              )}
              {status === 'approved' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  <CheckCircle className="h-16 w-16 mx-auto text-emerald-600 dark:text-emerald-500 mb-4" />
                </motion.div>
              )}
              {status === 'error' && (
                <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
              )}
              
              <CardTitle className="text-2xl">
                {status === 'loading' && t('membershipSuccess.processing')}
                {status === 'success' && t('membershipSuccess.paymentConfirmed')}
                {status === 'approved' && t('membershipSuccess.approvedTitle')}
                {status === 'error' && t('membershipSuccess.oops')}
              </CardTitle>
              <CardDescription className="text-base">
                {status === 'loading' && t('membershipSuccess.waitingPayment')}
                {(status === 'success' || status === 'approved' || status === 'error') && message}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Process Timeline — shown on success/approved */}
              {(status === 'success' || status === 'approved') && (
                <div className="bg-muted/30 rounded-lg p-4 border">
                  <ProcessTimeline status={status} t={t} />
                </div>
              )}

              {/* Pending approval status block */}
              {status === 'success' && (
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t('membershipSuccess.membershipStatus')}</p>
                  <p className="font-medium text-warning">{t('membershipSuccess.pendingApproval')}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('membershipSuccess.pendingApprovalDesc')}
                  </p>
                </div>
              )}

              {/* Approved — direct portal CTA */}
              {status === 'approved' && (
                <Button
                  className="w-full"
                  onClick={() => navigate(`/${tenantSlug}/portal`)}
                >
                  {t('membershipSuccess.approvedCta')}
                </Button>
              )}

              {/* Safe fallback CTA — always visible on success/approved */}
              {(status === 'success' || status === 'approved') && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/${tenantSlug}/membership/status`)}
                >
                  {t('membershipSuccess.viewStatus')}
                </Button>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => navigate(`/${tenantSlug}`)}
                  variant={status === 'error' ? 'outline' : 'ghost'}
                  className="w-full"
                >
                  {t('membershipSuccess.backTo', { tenant: tenant?.name || '' })}
                </Button>
                
                {status === 'error' && (
                  <Button
                    onClick={() => navigate(`/${tenantSlug}/membership/new`)}
                    variant="default"
                    className="w-full"
                  >
                    {t('membershipSuccess.tryAgain')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
