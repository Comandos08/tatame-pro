/**
 * ============================================================================
 * 📭 EMPTY STATE CARD — Informative Absence UX
 * ============================================================================
 * 
 * P2.6: Read-only component for displaying empty states without blocking.
 * 
 * PURPOSE:
 * Communicates "no data yet" in a calm, non-alarming way.
 * This is NOT an error, NOT a blocker, NOT a loading state.
 * 
 * VARIANTS:
 * - inline: Compact display for use inside existing cards/sections (no animation)
 * - standalone: Full-page centered display for main content areas (subtle motion)
 * 
 * CONTRACT:
 * - No fetch
 * - No actions/callbacks
 * - No state mutation
 * - Pure informational display
 * 
 * SAFE GOLD:
 * Removing this component must not affect system behavior.
 * 
 * USAGE:
 * ```tsx
 * // Inside a card or section
 * <EmptyStateCard
 *   icon={Calendar}
 *   titleKey="empty.events.title"
 *   descriptionKey="empty.events.desc"
 *   hintKey="empty.events.hint"
 *   variant="inline"
 * />
 * 
 * // As main page content
 * <EmptyStateCard
 *   icon={Users}
 *   titleKey="empty.athletes.title"
 *   descriptionKey="empty.athletes.desc"
 *   variant="standalone"
 * />
 * ```
 * ============================================================================
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

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
}: EmptyStateCardProps) {
  const { t } = useI18n();

  // DEV-only: warn if i18n keys are missing (helps catch typos early)
  if (import.meta.env.DEV) {
    const titleValue = t(titleKey);
    const descValue = t(descriptionKey);
    
    if (titleValue === titleKey) {
      console.warn(
        `[EmptyStateCard] Missing i18n key: "${titleKey}". Add it to locale files.`
      );
    }
    if (descValue === descriptionKey) {
      console.warn(
        `[EmptyStateCard] Missing i18n key: "${descriptionKey}". Add it to locale files.`
      );
    }
  }

  // Inline variant: compact, for use inside existing cards/sections
  // NO animation - appears instantly within parent context
  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 px-4', className)}>
        {/* Icon Circle - muted, decorative only */}
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        
        {/* Title - consistent with BlockedStateCard hierarchy */}
        <h3 className="text-base font-semibold text-foreground mb-1 text-center">
          {t(titleKey)}
        </h3>
        
        {/* Description - secondary emphasis */}
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-1">
          {t(descriptionKey)}
        </p>
        
        {/* Hint - tertiary emphasis, softer tone */}
        {hintKey && (
          <p className="text-xs text-muted-foreground/60 text-center mt-1 max-w-sm">
            {t(hintKey)}
          </p>
        )}
      </div>
    );
  }

  // Standalone variant: full page centered, for main content areas
  // Subtle motion on mount for perceived quality
  return (
    <div className={cn('min-h-screen flex items-center justify-center bg-background p-4', className)}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            {/* Icon Circle - muted, decorative only */}
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>

            {/* Title - consistent typography */}
            <CardTitle className="text-xl font-semibold">{t(titleKey)}</CardTitle>

            {/* Description - secondary emphasis */}
            <CardDescription className="text-base mt-2">
              {t(descriptionKey)}
            </CardDescription>
          </CardHeader>

          {/* Optional Hint - tertiary emphasis */}
          {hintKey && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground/80 text-center">
                {t(hintKey)}
              </p>
            </CardContent>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

export default EmptyStateCard;
