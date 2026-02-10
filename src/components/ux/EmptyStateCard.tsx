/**
 * ============================================================================
 * 📭 EMPTY STATE CARD — Pedagogical Absence UX (C2 SAFE GOLD)
 * ============================================================================
 * 
 * Communicates "no data yet" with:
 * - Clear explanation of WHY it's empty
 * - Orientation toward the NEXT STEP
 * - Persona-aware copy (ADMIN vs ATHLETE)
 * - Optional primary/secondary CTAs
 * 
 * VARIANTS:
 * - inline: Compact display for use inside existing cards/sections
 * - standalone: Full-page centered display for main content areas
 * 
 * CONTRACT:
 * - No fetch
 * - No state mutation
 * - CTAs never bypass gates (caller responsibility)
 * - Pure informational + orientational display
 * 
 * SAFE GOLD:
 * Removing this component must not affect system behavior.
 * ============================================================================
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

export interface EmptyStateAction {
  /** i18n key for button label */
  labelKey: string;
  /** Click handler — caller ensures no gate bypass */
  onClick: () => void;
}

export interface EmptyStateCardProps {
  /** Lucide icon component to display */
  icon: LucideIcon;
  /** i18n key for title */
  titleKey: string;
  /** i18n key for description */
  descriptionKey: string;
  /** Optional i18n key for hint/orientation text */
  hintKey?: string;
  /** Visual variant: inline (inside cards), standalone (centered full page) */
  variant?: 'inline' | 'standalone';
  /** Optional className for outer container */
  className?: string;
  /** Primary CTA — the recommended next step */
  primaryAction?: EmptyStateAction;
  /** Secondary CTA — alternative or informational */
  secondaryAction?: EmptyStateAction;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EmptyStateCard({
  icon: Icon,
  titleKey,
  descriptionKey,
  hintKey,
  variant = 'inline',
  className,
  primaryAction,
  secondaryAction,
}: EmptyStateCardProps) {
  const { t } = useI18n();

  // DEV-only: warn if i18n keys are missing
  if (import.meta.env.DEV) {
    const titleValue = t(titleKey);
    const descValue = t(descriptionKey);
    if (titleValue === titleKey) {
      console.warn(`[EmptyStateCard] Missing i18n key: "${titleKey}". Add it to locale files.`);
    }
    if (descValue === descriptionKey) {
      console.warn(`[EmptyStateCard] Missing i18n key: "${descriptionKey}". Add it to locale files.`);
    }
  }

  const actions = (primaryAction || secondaryAction) ? (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
      {primaryAction && (
        <Button size="sm" onClick={primaryAction.onClick}>
          {t(primaryAction.labelKey)}
        </Button>
      )}
      {secondaryAction && (
        <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>
          {t(secondaryAction.labelKey)}
        </Button>
      )}
    </div>
  ) : null;

  // Inline variant: compact, for use inside existing cards/sections
  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 px-4', className)}>
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1 text-center">
          {t(titleKey)}
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-1">
          {t(descriptionKey)}
        </p>
        {hintKey && (
          <p className="text-xs text-muted-foreground/60 text-center mt-1 max-w-sm">
            {t(hintKey)}
          </p>
        )}
        {actions}
      </div>
    );
  }

  // Standalone variant: full page centered
  return (
    <div className={cn('min-h-screen flex items-center justify-center bg-background p-4', className)}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl font-semibold">{t(titleKey)}</CardTitle>
            <CardDescription className="text-base mt-2">
              {t(descriptionKey)}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {hintKey && (
              <p className="text-sm text-muted-foreground/80 text-center mb-2">
                {t(hintKey)}
              </p>
            )}
            {actions}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default EmptyStateCard;
