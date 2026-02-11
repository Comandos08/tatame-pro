/**
 * PI U10 — NextBestActionCard (Presentation Only)
 *
 * Renders the next best action suggestion when present.
 * If NextBestAction is null → renders nothing (zero noise).
 *
 * NO business logic. NO rules. Pure presentation.
 */


import { ArrowRight, Info, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { NextBestAction } from '@/lib/ux/nextBestAction';

interface NextBestActionCardProps {
  action: NextBestAction;
}

export function NextBestActionCard({ action }: NextBestActionCardProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  // Zero noise: no action = no card
  if (!action) return null;

  const isWarning = action.reason === 'BILLING_BLOCKED' || action.reason === 'TENANT_BLOCKED';
  const Icon = isWarning ? AlertTriangle : Info;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isWarning
          ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
          : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
      }`}
      role="status"
      aria-live="polite"
      data-testid="next-best-action"
      data-nba-reason={action.reason}
      data-nba-kind={action.kind}
    >
      <div className="flex items-center gap-3">
        <Icon
          className={`h-5 w-5 shrink-0 ${
            isWarning
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}
        />
        <p
          className={`flex-1 text-sm font-medium ${
            isWarning
              ? 'text-yellow-900 dark:text-yellow-100'
              : 'text-blue-900 dark:text-blue-100'
          }`}
        >
          {t(action.labelKey)}
        </p>
        {action.kind === 'CTA' && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate(action.href)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
