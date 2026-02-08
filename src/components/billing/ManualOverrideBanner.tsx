/**
 * SAFE GOLD — ETAPA 2
 * Banner visual para exibir quando billing está em override manual
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate } from '@/lib/i18n/formatters';

interface ManualOverrideBannerProps {
  reason: string | null;
  appliedAt: Date | null;
}

export function ManualOverrideBanner({ reason, appliedAt }: ManualOverrideBannerProps) {
  const { t, locale } = useI18n();
  
  const formattedDate = appliedAt && !isNaN(appliedAt.getTime())
    ? formatDate(appliedAt, locale, { dateStyle: 'long' })
    : null;

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('billing.manualOverride')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t('billing.manualOverrideDesc')}</p>
        <p className="text-sm">
          <strong>{t('billing.overrideReason')}:</strong>{' '}
          {reason || t('billing.overrideReasonUnknown')}
        </p>
        {formattedDate && (
          <p className="text-sm">
            <strong>{t('billing.overrideAt')}:</strong> {formattedDate}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
