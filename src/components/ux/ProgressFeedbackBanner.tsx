/**
 * PI U11 — ProgressFeedbackBanner (Presentation Only)
 *
 * Renders positive feedback when real progress occurred.
 * If feedback is null → renders nothing (zero noise).
 * Dismissable — won't reappear in the same session.
 *
 * NO business logic. NO rules. Pure presentation.
 */


import { CheckCircle2, Info, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Button } from '@/components/ui/button';
import type { ProgressFeedback } from '@/lib/ux/progressFeedback';

interface ProgressFeedbackBannerProps {
  feedback: ProgressFeedback | null;
  onDismiss: () => void;
}

export function ProgressFeedbackBanner({ feedback, onDismiss }: ProgressFeedbackBannerProps) {
  const { t } = useI18n();

  if (!feedback) return null;

  const isSuccess = feedback.kind === 'SUCCESS';
  const Icon = isSuccess ? CheckCircle2 : Info;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isSuccess
          ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
          : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
      }`}
      role="status"
      aria-live="polite"
      data-testid="progress-feedback-banner"
      data-feedback-kind={feedback.kind}
      data-feedback-event={feedback.event}
    >
      <div className="flex items-center gap-3">
        <Icon
          className={`h-5 w-5 shrink-0 ${
            isSuccess
              ? 'text-green-600 dark:text-green-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}
        />
        <p
          className={`flex-1 text-sm font-medium ${
            isSuccess
              ? 'text-green-900 dark:text-green-100'
              : 'text-blue-900 dark:text-blue-100'
          }`}
        >
          {t(feedback.messageKey)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 w-7 p-0"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
