/**
 * BillingTimeline — Visual timeline of billing progression
 * 
 * P3.3 — Billing UX Advanced Layer
 * 
 * Shows: Trial → Trial Expired → Pending Delete → Deleted
 * 
 * RULES:
 * - 100% read-only
 * - Pure UX / visualization
 * - No decision logic
 */

import React from 'react';
import { Clock, AlertTriangle, Trash2, XCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useTenant } from '@/contexts/TenantContext';
import { cn } from '@/lib/utils';

interface TimelineStep {
  id: string;
  labelKey: string;
  icon: React.ElementType;
  status: 'completed' | 'current' | 'upcoming' | 'danger';
  date?: string | null;
}

interface BillingTimelineProps {
  className?: string;
}

export function BillingTimeline({ className }: BillingTimelineProps) {
  const { tenant } = useTenant();
  const { billingState, isLoading } = useTenantStatus();
  const { t, locale } = useI18n();

  // Don't render for non-ACTIVE tenants (still in SETUP)
  if (tenant?.status !== 'ACTIVE') {
    return null;
  }

  if (isLoading) {
    return (
      <Card className={cn('animate-pulse', className)}>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 w-24 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = billingState?.status;

  const formatDate = (dateString: string | null | undefined): string | null => {
    if (!dateString) return null;
    const localeMap: Record<string, string> = {
      'pt-BR': 'pt-BR',
      'en': 'en-US',
      'es': 'es-ES',
    };
    return new Date(dateString).toLocaleDateString(localeMap[locale] || 'pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };

  // Determine step statuses based on current billing status
  const getStepStatus = (step: string): TimelineStep['status'] => {
    const statusOrder = ['TRIALING', 'TRIAL_EXPIRED', 'PENDING_DELETE', 'DELETED'];
    const currentIndex = statusOrder.indexOf(status || 'ACTIVE');

    // ACTIVE status means user has converted - show completed for trial and skip danger states
    if (status === 'ACTIVE') {
      if (step === 'trial') return 'completed';
      return 'upcoming';
    }

    switch (step) {
      case 'trial':
        if (status === 'TRIALING') return 'current';
        if (currentIndex > 0) return 'completed';
        return 'upcoming';
      case 'expired':
        if (status === 'TRIAL_EXPIRED') return 'current';
        if (currentIndex > 1) return 'completed';
        return 'upcoming';
      case 'pendingDelete':
        if (status === 'PENDING_DELETE') return 'danger';
        if (currentIndex > 2) return 'completed';
        return 'upcoming';
      case 'deleted':
        return 'upcoming';
      default:
        return 'upcoming';
    }
  };

  const steps: TimelineStep[] = [
    {
      id: 'trial',
      labelKey: 'billing.timeline.trial',
      icon: Clock,
      status: getStepStatus('trial'),
    },
    {
      id: 'expired',
      labelKey: 'billing.timeline.expired',
      icon: AlertTriangle,
      status: getStepStatus('expired'),
    },
    {
      id: 'pendingDelete',
      labelKey: 'billing.timeline.pendingDelete',
      icon: Trash2,
      status: getStepStatus('pendingDelete'),
    },
    {
      id: 'deleted',
      labelKey: 'billing.timeline.deleted',
      icon: XCircle,
      status: getStepStatus('deleted'),
    },
  ];

  const stepStyles = {
    completed: {
      icon: 'bg-success/20 text-success border-success/30',
      line: 'bg-success',
      text: 'text-muted-foreground',
    },
    current: {
      icon: 'bg-warning/20 text-warning border-warning/30 ring-2 ring-warning/20',
      line: 'bg-border',
      text: 'text-foreground font-medium',
    },
    upcoming: {
      icon: 'bg-muted text-muted-foreground border-border',
      line: 'bg-border',
      text: 'text-muted-foreground',
    },
    danger: {
      icon: 'bg-destructive/20 text-destructive border-destructive/30 ring-2 ring-destructive/20',
      line: 'bg-destructive/50',
      text: 'text-destructive font-medium',
    },
  };

  // For ACTIVE users, show a simplified success state
  if (status === 'ACTIVE') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle className="h-5 w-5 text-success" />
            {t('billing.timeline.title')}
          </CardTitle>
          <CardDescription>{t('billing.timeline.activeDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('billing.timeline.subscriptionActive')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{t('billing.timeline.title')}</CardTitle>
        <CardDescription>{t('billing.timeline.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline connector line */}
          <div className="absolute top-5 left-5 right-5 h-0.5 bg-border -z-10" />
          
          {/* Steps */}
          <div className="flex justify-between">
            {steps.map((step, index) => {
              const StepIcon = step.status === 'completed' ? CheckCircle : step.icon;
              const styles = stepStyles[step.status];

              return (
                <div key={step.id} className="flex flex-col items-center">
                  {/* Icon circle */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full border-2 flex items-center justify-center bg-background',
                      styles.icon
                    )}
                  >
                    <StepIcon className="h-4 w-4" />
                  </div>
                  
                  {/* Label */}
                  <span className={cn('text-xs mt-2 text-center max-w-16', styles.text)}>
                    {t(step.labelKey)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BillingTimeline;
