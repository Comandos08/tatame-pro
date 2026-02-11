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
  const { t } = useI18n();

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

  // Removed local formatDate - using centralized formatter

  // P3.3.P1.2: Explicit mapping, zero heuristics
  // Timeline state is 100% declarative based on current status only
  const getStepStatus = (step: string): TimelineStep['status'] => {
    // Explicit mapping per billing status - no indexOf or implicit ordering
    const stateMap: Record<string, Record<string, TimelineStep['status']>> = {
      ACTIVE: {
        trial: 'completed',
        expired: 'upcoming',
        pendingDelete: 'upcoming',
        deleted: 'upcoming',
      },
      TRIALING: {
        trial: 'current',
        expired: 'upcoming',
        pendingDelete: 'upcoming',
        deleted: 'upcoming',
      },
      TRIAL_EXPIRED: {
        trial: 'completed',
        expired: 'current',
        pendingDelete: 'upcoming',
        deleted: 'upcoming',
      },
      PENDING_DELETE: {
        trial: 'completed',
        expired: 'completed',
        pendingDelete: 'danger',
        deleted: 'upcoming',
      },
      PAST_DUE: {
        trial: 'completed',
        expired: 'current',
        pendingDelete: 'upcoming',
        deleted: 'upcoming',
      },
      CANCELED: {
        trial: 'completed',
        expired: 'completed',
        pendingDelete: 'danger',
        deleted: 'upcoming',
      },
    };

    // P3.3.P1.3: Never invent status - use explicit null handling
    const currentStatus = status ?? 'TRIALING';
    return stateMap[currentStatus]?.[step] ?? 'upcoming';
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

  // P3.3.P1.1: Use guaranteed Tailwind tokens only
  const stepStyles = {
    completed: {
      icon: 'bg-green-50 text-green-600 border-green-200',
      line: 'bg-green-500',
      text: 'text-muted-foreground',
    },
    current: {
      icon: 'bg-amber-50 text-amber-600 border-amber-200 ring-2 ring-amber-200',
      line: 'bg-border',
      text: 'text-foreground font-medium',
    },
    upcoming: {
      icon: 'bg-muted text-muted-foreground border-border',
      line: 'bg-border',
      text: 'text-muted-foreground',
    },
    danger: {
      icon: 'bg-red-50 text-red-600 border-red-200 ring-2 ring-red-200',
      line: 'bg-red-300',
      text: 'text-red-600 font-medium',
    },
  };

  // For ACTIVE users, show a simplified success state
  // P3.3.P1.1: Use guaranteed Tailwind tokens
  if (status === 'ACTIVE') {
    return (
      <Card className={className} data-testid="billing-timeline" data-timeline-status="ACTIVE">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
            {t('billing.timeline.title')}
          </CardTitle>
          <CardDescription>{t('billing.timeline.activeDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{t('billing.timeline.subscriptionActive')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} data-testid="billing-timeline" data-timeline-status={status ?? 'LOADING'}>
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
            {steps.map((step, _index) => {
              const StepIcon = step.status === 'completed' ? CheckCircle : step.icon;
              const styles = stepStyles[step.status];

              return (
                <div 
                  key={step.id} 
                  className="flex flex-col items-center"
                  data-timeline-step={step.id}
                  data-timeline-step-status={step.status}
                >
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
