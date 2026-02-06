/**
 * ============================================================================
 * ⏳ TRANSITION FEEDBACK — Async State Communication
 * ============================================================================
 * 
 * P2.7: Read-only component for communicating transition states after user actions.
 * 
 * PURPOSE:
 * Reduces user anxiety during async operations by providing clear, calm feedback.
 * This is NOT a loader, NOT a blocker, NOT a global notification.
 * 
 * STATES:
 * - idle: No feedback shown (returns null)
 * - in_progress: Subtle processing indicator
 * - success: Confirmation of completed action
 * - warning: Action completed with caveats
 * - error: Action failed (informational only, no retry)
 * 
 * CONTRACT:
 * - No fetch
 * - No callbacks
 * - No state mutation
 * - No side effects
 * - Pure visual reflection of external state
 * 
 * SAFE GOLD:
 * Removing this component must not affect system behavior.
 * 
 * USAGE:
 * ```tsx
 * <TransitionFeedback
 *   status={submitStatus}
 *   titleKey="transition.success.title"
 *   descriptionKey="transition.success.desc"
 * />
 * ```
 * ============================================================================
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, AlertCircle, Loader2, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

export const TRANSITION_STATUSES = [
  'idle',
  'in_progress',
  'success',
  'warning',
  'error',
] as const;

export type TransitionStatus = typeof TRANSITION_STATUSES[number];

export interface TransitionFeedbackProps {
  /** Current transition state */
  status: TransitionStatus;
  /** i18n key for title */
  titleKey: string;
  /** Optional i18n key for description */
  descriptionKey?: string;
  /** Optional i18n key for hint text */
  hintKey?: string;
  /** Optional className for outer container */
  className?: string;
}

// =============================================================================
// STATUS CONFIGURATION
// =============================================================================

interface StatusConfig {
  icon: LucideIcon | null;
  iconClass: string;
  containerClass: string;
  animate: boolean;
  spin: boolean;
}

const statusConfig: Record<TransitionStatus, StatusConfig> = {
  idle: {
    icon: null,
    iconClass: '',
    containerClass: '',
    animate: false,
    spin: false,
  },
  in_progress: {
    icon: Loader2,
    iconClass: 'text-muted-foreground',
    containerClass: 'bg-muted/50',
    animate: false,
    spin: true,
  },
  success: {
    icon: CheckCircle,
    iconClass: 'text-green-600 dark:text-green-500',
    containerClass: 'bg-green-50 dark:bg-green-950/20',
    animate: true,
    spin: false,
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-500',
    containerClass: 'bg-amber-50 dark:bg-amber-950/20',
    animate: true,
    spin: false,
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-destructive',
    containerClass: 'bg-destructive/10',
    animate: true,
    spin: false,
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function TransitionFeedback({
  status,
  titleKey,
  descriptionKey,
  hintKey,
  className,
}: TransitionFeedbackProps) {
  const { t } = useI18n();

  // DEV-only: warn if required i18n key is missing
  if (import.meta.env.DEV) {
    const titleValue = t(titleKey);
    if (titleValue === titleKey) {
      console.warn(
        `[TransitionFeedback] Missing i18n key: "${titleKey}". Add it to locale files.`
      );
    }
  }

  // Idle state: render nothing
  if (status === 'idle') {
    return null;
  }

  // Defensive fallback for unknown status
  const resolvedStatus: TransitionStatus = statusConfig[status] ? status : 'in_progress';
  const config = statusConfig[resolvedStatus];
  const Icon = config.icon;

  const content = (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-4 py-3',
        config.containerClass,
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Icon */}
      {Icon && (
        <Icon 
          className={cn(
            'h-5 w-5 flex-shrink-0',
            config.iconClass,
            config.spin && 'animate-spin'
          )} 
          aria-hidden="true" 
        />
      )}

      {/* Text Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Title (required) */}
        <p className="text-sm font-medium text-foreground">
          {t(titleKey)}
        </p>

        {/* Description (optional, only if translation exists) */}
        {descriptionKey && t(descriptionKey) !== descriptionKey && (
          <p className="text-xs text-muted-foreground">
            {t(descriptionKey)}
          </p>
        )}

        {/* Hint (optional, only if translation exists) */}
        {hintKey && t(hintKey) !== hintKey && (
          <p className="text-xs text-muted-foreground/70">
            {t(hintKey)}
          </p>
        )}
      </div>
    </div>
  );

  // Apply entrance animation for final states (success, warning, error)
  if (config.animate) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  }

  // No animation for in_progress (appears instantly)
  return content;
}

export default TransitionFeedback;
