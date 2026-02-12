import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Circle, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthenticatedHeader } from '@/components/auth/AuthenticatedHeader';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type ConfirmationStatus = 'loading' | 'success' | 'approved' | 'error' | 'missing_params' | 'pending_confirmation';

/**
 * FX-03A — Normalize raw membership status from backend to local confirmation status.
 */
function normalizeMembershipStatus(rawStatus: string | undefined | null): ConfirmationStatus {
  switch (rawStatus) {
    case 'ACTIVE':
    case 'APPROVED':
      return 'approved';
    case 'PENDING_APPROVAL':
    case 'PENDING_REVIEW':
    case 'UNDER_REVIEW':
    default:
      return 'success';
  }
}

/**
 * FX-03 — Process Timeline
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
  const [retrying, setRetrying] = useState(false);

  const membershipId = searchParams.get('membership_id');
  const sessionId = searchParams.get('session_id');

  // FX-03A: Single-shot guard — prevent double invocation (StrictMode)
  const confirmCalledRef = useRef(false);

  const runConfirmation = useCallback(async () => {
    if (!membershipId || !sessionId) return;

    try {
      const { data, error } = await supabase.functions.invoke('confirm-membership-payment', {
        body: { sessionId, membershipId },
      });

      if (error) throw error;

      if (data?.success) {
        const normalized = normalizeMembershipStatus(data?.membershipStatus);
        setStatus(normalized);
        setMessage(
          normalized === 'approved'
            ? t('membershipSuccess.approvedSubtitle')
            : t('membershipSuccess.successMessage')
        );
      } else {
        // FX-05A: Non-success but payment may exist — pending confirmation, not error
        setStatus('pending_confirmation');
        setMessage(data?.message || t('membershipSuccess.confirmPending'));
      }
    } catch (error) {
      logger.error('Error confirming payment:', error);
      // FX-05A: Network/server error — payment may have succeeded via webhook
      setStatus('pending_confirmation');
      setMessage(t('membershipSuccess.processError'));
    }
  }, [membershipId, sessionId, t]);

  useEffect(() => {
    if (confirmCalledRef.current) return;

    // FX-05: Missing params — user returned to stale URL or Stripe redirect failed
    if (!membershipId || !sessionId) {
      setStatus('missing_params');
      setMessage(t('membershipSuccess.invalidParams'));
      return;
    }

    confirmCalledRef.current = true;
    runConfirmation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipId, sessionId]);

  // FX-05A: Retry only available for pending_confirmation
  const handleRetry = useCallback(async () => {
    if (retrying || !membershipId || !sessionId) return;
    setRetrying(true);
    setStatus('loading');
    setMessage('');
    await runConfirmation();
    setRetrying(false);
  }, [retrying, membershipId, sessionId, runConfirmation]);

  // Navigation handlers — never called during render
  const goToStatus = useCallback(() => {
    navigate(`/${tenantSlug}/membership/status`, { replace: true });
  }, [navigate, tenantSlug]);

  const goToPortal = useCallback(() => {
    navigate(`/${tenantSlug}/portal`);
  }, [navigate, tenantSlug]);

  const goToHome = useCallback(() => {
    navigate(`/${tenantSlug}`);
  }, [navigate, tenantSlug]);

  const goToNewMembership = useCallback(() => {
    navigate(`/${tenantSlug}/membership/new`);
  }, [navigate, tenantSlug]);

  // Determine icon & title based on status
  const isHardError = status === 'error' || status === 'missing_params';
  const isPendingConfirmation = status === 'pending_confirmation';

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
              {status === 'success' && (
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
              {status === 'pending_confirmation' && (
                <AlertCircle className="h-16 w-16 mx-auto text-warning mb-4" />
              )}
              {isHardError && (
                <AlertCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
              )}

              <CardTitle className="text-2xl">
                {status === 'loading' && t('membershipSuccess.processing')}
                {status === 'success' && t('membershipSuccess.paymentConfirmed')}
                {status === 'approved' && t('membershipSuccess.approvedTitle')}
                {status === 'pending_confirmation' && t('membershipSuccess.pendingConfirmationTitle')}
                {isHardError && t('membershipSuccess.oops')}
              </CardTitle>
              <CardDescription className="text-base">
                {status === 'loading' && t('membershipSuccess.waitingPayment')}
                {status !== 'loading' && message}
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
                <Button className="w-full" onClick={goToPortal}>
                  {t('membershipSuccess.approvedCta')}
                </Button>
              )}

              {/* FX-05A: Pending confirmation — warning tone, retry + status CTA */}
              {isPendingConfirmation && (
                <div className="flex flex-col gap-2">
                  {membershipId && sessionId && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleRetry}
                      disabled={retrying}
                    >
                      <RefreshCw className={cn('mr-2 h-4 w-4', retrying && 'animate-spin')} />
                      {t('membershipSuccess.retryConfirmation')}
                    </Button>
                  )}
                  <Button className="w-full" onClick={goToStatus}>
                    {t('membershipSuccess.viewStatus')}
                  </Button>
                </div>
              )}

              {/* FX-05A: Hard error — destructive tone, try again + back */}
              {isHardError && (
                <div className="flex flex-col gap-2">
                  <Button className="w-full" onClick={goToStatus}>
                    {t('membershipSuccess.viewStatus')}
                  </Button>
                </div>
              )}

              {/* Safe fallback CTA — always visible on success/approved */}
              {(status === 'success' || status === 'approved') && (
                <Button variant="outline" className="w-full" onClick={goToStatus}>
                  {t('membershipSuccess.viewStatus')}
                </Button>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={goToHome}
                  variant="ghost"
                  className="w-full"
                >
                  {t('membershipSuccess.backTo', { tenant: tenant?.name || '' })}
                </Button>

                {status === 'missing_params' && (
                  <Button onClick={goToNewMembership} variant="outline" className="w-full">
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
