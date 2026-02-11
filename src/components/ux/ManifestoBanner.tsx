/**
 * PI U19 — ManifestoBanner (Presentation Only)
 *
 * CONTRACT:
 * - null → does not render
 * - No CTA, no button, no dismiss
 * - Institutional tone only
 * - Uses semantic data-* attributes
 */

import { useI18n } from '@/contexts/I18nContext';
import { Shield } from 'lucide-react';
import type { Manifesto } from '@/lib/ux/manifestoMode';

export interface ManifestoBannerProps {
  manifesto: Manifesto | null;
}

export function ManifestoBanner({ manifesto }: ManifestoBannerProps) {
  const { t } = useI18n();

  if (!manifesto) return null;

  return (
    <div
      data-testid="manifesto-banner"
      data-kind={manifesto.kind}
      className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-4"
    >
      <Shield className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">
          {t(manifesto.titleKey)}
        </h4>
        <p className="text-sm text-muted-foreground">
          {t(manifesto.messageKey)}
        </p>
      </div>
    </div>
  );
}
