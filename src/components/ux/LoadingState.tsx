/**
 * ============================================================================
 * ⏳ LOADING STATE — Unified Loading UI
 * ============================================================================
 * 
 * P1.2: Standardized loading component that explains WHAT the system is doing.
 * 
 * DESIGN PRINCIPLES:
 * - Uses i18n keys for ALL text (no hardcoded strings)
 * - Three variants: fullscreen (gates), card (sections), inline (tables)
 * - Optional timeout hint for long-running operations
 * ============================================================================
 */


import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

export interface LoadingStateProps {
  /** i18n key for main loading text */
  titleKey: string;
  /** Optional i18n key for subtitle/secondary text */
  subtitleKey?: string;
  /** Visual variant */
  variant?: 'fullscreen' | 'card' | 'inline';
  /** Optional className for customization */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function LoadingState({
  titleKey,
  subtitleKey,
  variant = 'fullscreen',
  className,
}: LoadingStateProps) {
  const { t } = useI18n();

  // =========================================================================
  // INLINE VARIANT
  // =========================================================================
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t(titleKey)}</span>
      </div>
    );
  }

  // =========================================================================
  // CARD VARIANT
  // =========================================================================
  if (variant === 'card') {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{t(titleKey)}</span>
            {subtitleKey && (
              <span className="text-xs text-muted-foreground">{t(subtitleKey)}</span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // =========================================================================
  // FULLSCREEN VARIANT (default)
  // =========================================================================
  return (
    <div className={cn('min-h-screen flex items-center justify-center bg-background', className)}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-foreground font-medium">{t(titleKey)}</p>
          {subtitleKey && (
            <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default LoadingState;
