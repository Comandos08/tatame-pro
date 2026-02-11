/**
 * PI-U02 — TenantOnboardingCard (SAFE GOLD)
 *
 * Institutional activation checklist card.
 * READ-ONLY — Zero mutations. No buttons alter state.
 * Only navigation CTAs via NextBestAction.
 */

import { CheckCircle2, Lock, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';
import { useNextBestAction } from '@/hooks/useNextBestAction';
import { cn } from '@/lib/utils';
import type { TenantOnboardingStep, OnboardingStepStatus } from '@/domain/onboarding/deriveTenantOnboarding';

interface TenantOnboardingCardProps {
  steps: TenantOnboardingStep[];
  completionPercent: number;
}

function StepStatusIcon({ status }: { status: OnboardingStepStatus }) {
  switch (status) {
    case 'DONE':
      return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-500 shrink-0" />;
    case 'LOCKED':
      return <Lock className="h-5 w-5 text-muted-foreground/50 shrink-0" />;
    case 'PENDING':
    default:
      return <Circle className="h-5 w-5 text-amber-500 shrink-0" />;
  }
}

function StepStatusBadge({ status }: { status: OnboardingStepStatus }) {
  const { t } = useI18n();

  const config: Record<OnboardingStepStatus, { label: string; className: string }> = {
    DONE: {
      label: t('onboarding.checklist.statusDone'),
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    },
    PENDING: {
      label: t('onboarding.checklist.statusPending'),
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    },
    LOCKED: {
      label: t('onboarding.checklist.statusLocked'),
      className: 'bg-muted text-muted-foreground border-border',
    },
  };

  const c = config[status];
  return (
    <Badge variant="outline" className={cn('text-xs font-normal', c.className)}>
      {c.label}
    </Badge>
  );
}

export function TenantOnboardingCard({ steps, completionPercent }: TenantOnboardingCardProps) {
  const { t } = useI18n();
  const nba = useNextBestAction();

  return (
    <Card data-testid="tenant-onboarding-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{t('onboarding.checklist.title')}</CardTitle>
            <CardDescription>{t('onboarding.checklist.subtitle')}</CardDescription>
          </div>
          <span className="text-2xl font-display font-bold text-primary">
            {completionPercent}%
          </span>
        </div>
        <Progress value={completionPercent} className="h-2 mt-2" />
      </CardHeader>

      <CardContent className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border transition-colors',
              step.status === 'DONE' && 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200/50 dark:border-emerald-900/30',
              step.status === 'PENDING' && 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-900/30',
              step.status === 'LOCKED' && 'bg-muted/30 border-border/50 opacity-60',
            )}
            data-step-id={step.id}
            data-step-status={step.status}
          >
            <StepStatusIcon status={step.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn(
                  'text-sm font-medium',
                  step.status === 'LOCKED' && 'text-muted-foreground',
                  step.status === 'DONE' && 'line-through text-muted-foreground',
                )}>
                  {t(step.titleKey)}
                </span>
                <StepStatusBadge status={step.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {t(step.descriptionKey)}
              </p>
            </div>
          </div>
        ))}

        {/* NBA CTA — only navigation, never mutates */}
        {nba && nba.kind === 'CTA' && (
          <div className="pt-2">
            <Link to={nba.href}>
              <Button variant="default" size="sm" className="w-full">
                {t(nba.labelKey)}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
