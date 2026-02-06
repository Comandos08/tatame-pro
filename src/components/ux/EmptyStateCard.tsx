/**
 * ============================================================================
 * 📭 EMPTY STATE CARD — Informative Absence UX
 * ============================================================================
 * 
 * P2.6: Read-only component for displaying empty states without blocking.
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
 * <EmptyStateCard
 *   icon={Calendar}
 *   titleKey="empty.events.title"
 *   descriptionKey="empty.events.desc"
 *   hintKey="empty.events.hint"
 *   variant="inline"
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

  // Inline variant: compact, for use inside existing cards/sections
  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 px-4', className)}>
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-medium text-foreground mb-1">
          {t(titleKey)}
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {t(descriptionKey)}
        </p>
        {hintKey && (
          <p className="text-xs text-muted-foreground/70 text-center mt-2 max-w-sm">
            {t(hintKey)}
          </p>
        )}
      </div>
    );
  }

  // Standalone variant: full page centered, for main content areas
  return (
    <div className={cn('min-h-screen flex items-center justify-center bg-background p-4', className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            {/* Icon Circle */}
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Icon className="h-8 w-8 text-muted-foreground" />
            </div>

            {/* Title */}
            <CardTitle className="text-xl">{t(titleKey)}</CardTitle>

            {/* Description */}
            <CardDescription className="text-base mt-2">
              {t(descriptionKey)}
            </CardDescription>
          </CardHeader>

          {/* Optional Hint */}
          {hintKey && (
            <CardContent>
              <p className="text-sm text-muted-foreground text-center">
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
