/**
 * PI U13 — EmptyStateAuthority (Presentation Only)
 *
 * Renders authoritative empty states: explains absence, never suggests
 * unauthorized actions, never infers intent.
 *
 * If state is null → renders nothing.
 * NO business logic. NO CTA. Pure institutional communication.
 */

import React from 'react';
import { Info, Lock, Clock } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { EmptyState, EmptyStateIcon } from '@/lib/ux/emptyStateAuthority';

const ICON_MAP: Record<EmptyStateIcon, React.ElementType> = {
  INFO: Info,
  LOCK: Lock,
  CLOCK: Clock,
};

const KIND_STYLES: Record<string, { container: string; icon: string; text: string }> = {
  WAITING: {
    container: 'bg-muted/30 border-muted',
    icon: 'text-muted-foreground',
    text: 'text-muted-foreground',
  },
  BLOCKED: {
    container: 'bg-destructive/5 border-destructive/20',
    icon: 'text-destructive',
    text: 'text-destructive/90',
  },
  INFO: {
    container: 'bg-muted/20 border-border',
    icon: 'text-muted-foreground',
    text: 'text-muted-foreground',
  },
};

interface EmptyStateAuthorityProps {
  state: EmptyState | null;
}

export function EmptyStateAuthority({ state }: EmptyStateAuthorityProps) {
  const { t } = useI18n();

  if (!state) return null;

  const Icon = ICON_MAP[state.icon];
  const styles = KIND_STYLES[state.kind] ?? KIND_STYLES.INFO;

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-6 rounded-lg border ${styles.container}`}
      role="status"
      data-testid="empty-state-authority"
      data-empty-kind={state.kind}
      data-empty-reason={state.reason}
    >
      <Icon className={`h-10 w-10 mb-4 ${styles.icon}`} />
      <h3 className={`text-base font-semibold mb-1 ${styles.text}`}>
        {t(state.titleKey)}
      </h3>
      <p className={`text-sm text-center max-w-md ${styles.text} opacity-80`}>
        {t(state.descriptionKey)}
      </p>
    </div>
  );
}
