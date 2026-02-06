/**
 * 🎨 ONBOARDING PROGRESS — Visual Progress Indicator (UX Pure)
 * 
 * CONTRACT:
 * - This component is PURELY VISUAL
 * - It does NOT control flow, validate data, or make decisions
 * - It receives pre-computed steps from the consumer
 * - It renders progress based on provided status
 * 
 * RULES:
 * - NO side effects
 * - NO navigation/redirects
 * - NO state mutations
 * - NO clickable actions
 */

import React from 'react';
import { CheckCircle, Circle, ArrowRight } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

export type OnboardingStepKey = 'identity' | 'profile' | 'tenant' | 'roles';
export type OnboardingStepStatus = 'completed' | 'current' | 'pending';

export interface OnboardingProgressStep {
  /** Step identifier */
  key: OnboardingStepKey;
  /** i18n key for the step label */
  labelKey: string;
  /** Current status of the step */
  status: OnboardingStepStatus;
}

export interface OnboardingProgressProps {
  /** Array of steps to display */
  steps: OnboardingProgressStep[];
  /** Optional className for outer container */
  className?: string;
  /** Compact mode - shows only icons without labels */
  compact?: boolean;
}

/**
 * Renders the appropriate icon based on step status.
 * - completed: CheckCircle (green)
 * - current: ArrowRight (primary)
 * - pending: Circle (muted)
 */
function StepIcon({ status }: { status: OnboardingStepStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />;
    case 'current':
      return <ArrowRight className="h-5 w-5 text-primary" />;
    case 'pending':
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />;
  }
}

/**
 * Onboarding Progress Component
 * 
 * Displays a visual progress indicator for onboarding steps.
 * This is a PURE UX component with no side effects.
 */
export function OnboardingProgress({ 
  steps, 
  className,
  compact = false 
}: OnboardingProgressProps) {
  const { t } = useI18n();

  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <div 
      className={cn(
        "flex flex-col gap-2 py-3 px-4 bg-muted/30 rounded-lg border",
        className
      )}
      role="list"
      aria-label={t('onboarding.progress')}
    >
      {steps.map((step) => (
        <div 
          key={step.key}
          className={cn(
            "flex items-center gap-3",
            step.status === 'current' && "font-medium",
            step.status === 'pending' && "text-muted-foreground"
          )}
          role="listitem"
          aria-current={step.status === 'current' ? 'step' : undefined}
        >
          <StepIcon status={step.status} />
          {!compact && (
            <span className="text-sm">
              {t(step.labelKey)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default OnboardingProgress;
