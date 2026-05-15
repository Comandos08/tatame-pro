/**
 * ConnectPayoutsCard — Stripe Connect (Express) onboarding & status.
 *
 * The tenant owner connects their bank account here so membership/event
 * fees are paid directly to them (minus the platform fee). Rendered inside
 * TenantSettings, which is already ADMIN_TENANT-gated.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, ExternalLink, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/contexts/I18nContext';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { edgeInvoke } from '@/lib/edgeInvoke';
import { safeStripeRedirect } from '@/lib/stripeRedirect';
import { useTenantConnectStatus } from '@/hooks/useTenantConnectStatus';

export function ConnectPayoutsCard({ tenantId }: { tenantId: string }) {
  const { t } = useI18n();
  const { status, isLoading, refetch } = useTenantConnectStatus(tenantId);
  const [busy, setBusy] = useState<null | 'connect' | 'refresh' | 'dashboard'>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Returning from the Stripe-hosted onboarding flow (return/refresh URLs
  // append ?connect=...). Re-sync the status, then strip the param so a
  // page refresh doesn't re-trigger.
  useEffect(() => {
    const connectParam = searchParams.get('connect');
    if (connectParam === 'return' || connectParam === 'refresh') {
      refetch();
      const next = new URLSearchParams(searchParams);
      next.delete('connect');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, refetch]);

  const feePercent = (status.platformFeeBps / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  async function handleConnect() {
    setBusy('connect');
    try {
      const res = await edgeInvoke<{ onboardingUrl: string }>('connect-onboarding-start', {
        tenantId,
      });
      if (!res.ok || !res.data?.onboardingUrl) {
        toast.error(t('connect.error.start'));
        return;
      }
      if (!safeStripeRedirect(res.data.onboardingUrl)) {
        toast.error(t('connect.error.redirect'));
      }
    } catch (e) {
      logger.error('[connect] onboarding start failed', e);
      toast.error(t('connect.error.start'));
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh() {
    setBusy('refresh');
    try {
      await refetch();
      toast.success(t('connect.refreshed'));
    } finally {
      setBusy(null);
    }
  }

  async function handleDashboard() {
    setBusy('dashboard');
    try {
      const res = await edgeInvoke<{ url: string }>('connect-dashboard-login-link', {
        tenantId,
      });
      if (!res.ok || !res.data?.url) {
        toast.error(t('connect.error.dashboard'));
        return;
      }
      // Open in a new tab; validate it is a Stripe URL first.
      try {
        const u = new URL(res.data.url);
        if (u.protocol === 'https:' && u.hostname.endsWith('.stripe.com')) {
          window.open(res.data.url, '_blank', 'noopener,noreferrer');
        } else {
          toast.error(t('connect.error.dashboard'));
        }
      } catch {
        toast.error(t('connect.error.dashboard'));
      }
    } catch (e) {
      logger.error('[connect] dashboard link failed', e);
      toast.error(t('connect.error.dashboard'));
    } finally {
      setBusy(null);
    }
  }

  const ready = status.connected && status.chargesEnabled;
  const onboardingIncomplete = status.connected && !status.detailsSubmitted;
  const underReview = status.connected && status.detailsSubmitted && !status.chargesEnabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          {t('connect.title')}
        </CardTitle>
        <CardDescription>
          {t('connect.description').replace('{fee}', feePercent)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-9 w-40" />
          </div>
        ) : ready ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-green-700 dark:text-green-400">
                  {t('connect.status.active')}
                </p>
                <p className="text-muted-foreground">
                  {status.payoutsEnabled
                    ? t('connect.status.payoutsOn')
                    : t('connect.status.payoutsPending')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleDashboard} disabled={busy !== null}>
                {busy === 'dashboard' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                {t('connect.openDashboard')}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={busy !== null}>
                {busy === 'refresh' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('connect.refresh')}
              </Button>
            </div>
          </>
        ) : underReview ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <Loader2 className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 animate-spin" />
              <div className="text-sm">
                <p className="font-semibold text-amber-700 dark:text-amber-400">
                  {t('connect.status.underReview')}
                </p>
                <p className="text-muted-foreground">{t('connect.status.underReviewDesc')}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={busy !== null}>
              {busy === 'refresh' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t('connect.refresh')}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                {onboardingIncomplete
                  ? t('connect.status.incomplete')
                  : t('connect.status.notConnected')}
              </p>
            </div>
            <Button onClick={handleConnect} disabled={busy !== null}>
              {busy === 'connect' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Banknote className="h-4 w-4 mr-2" />
              )}
              {onboardingIncomplete ? t('connect.continue') : t('connect.connect')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
