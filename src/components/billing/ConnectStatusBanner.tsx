/**
 * ConnectStatusBanner — non-blocking warning shown where a tenant configures
 * paid things (event creation, membership fee) while their Stripe Connect
 * account is not yet ready to receive money.
 *
 * Phase 2 keeps a soft fallback (funds land in the platform account until the
 * tenant onboards), so this is a warning, not a hard block. Renders nothing
 * when the tenant is Connect-ready.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useTenantConnectStatus } from '@/hooks/useTenantConnectStatus';

export function ConnectStatusBanner({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const { t } = useI18n();
  const { status, isLoading, isReady } = useTenantConnectStatus(tenantId);

  // Don't flash the warning while we don't know yet, and hide it once ready.
  if (isLoading || isReady) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <p className="text-muted-foreground">
        {status.connected
          ? t('connect.banner.incomplete')
          : t('connect.banner.notConnected')}{' '}
        <Link
          to={`/${tenantSlug}/app/settings`}
          className="font-medium underline hover:text-foreground transition-colors"
        >
          {t('connect.banner.cta')}
        </Link>
      </p>
    </div>
  );
}
