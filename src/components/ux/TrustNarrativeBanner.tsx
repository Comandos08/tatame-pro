/**
 * PI U17 — TrustNarrativeBanner (Presentation Only)
 *
 * CONTRACT:
 * - null → does not render
 * - No CTA, no button, no action
 * - Institutional tone only
 * - Uses semantic data-* attributes
 */

import { useI18n } from '@/contexts/I18nContext';
import { Info, Lock, Clock } from 'lucide-react';
import type { TrustNarrative, TrustNarrativeKind } from '@/lib/ux/trustNarrative';

export interface TrustNarrativeBannerProps {
  narrative: TrustNarrative | null;
}

const ICON_MAP: Record<TrustNarrativeKind, React.ComponentType<{ className?: string }>> = {
  WAITING: Clock,
  BLOCKED: Lock,
  INFO: Info,
};

const STYLE_MAP: Record<TrustNarrativeKind, string> = {
  WAITING: 'border-muted bg-muted/30 text-muted-foreground',
  BLOCKED: 'border-destructive/30 bg-destructive/5 text-destructive',
  INFO: 'border-border bg-accent/30 text-accent-foreground',
};

export function TrustNarrativeBanner({ narrative }: TrustNarrativeBannerProps) {
  const { t } = useI18n();

  if (!narrative) return null;

  const Icon = ICON_MAP[narrative.kind];
  const style = STYLE_MAP[narrative.kind];

  return (
    <div
      data-testid="trust-narrative"
      data-kind={narrative.kind}
      data-reason={narrative.reason}
      className={`flex items-start gap-3 rounded-lg border p-4 ${style}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">
          {t(narrative.titleKey)}
        </h4>
        <p className="text-sm opacity-80">
          {t(narrative.messageKey)}
        </p>
      </div>
    </div>
  );
}
