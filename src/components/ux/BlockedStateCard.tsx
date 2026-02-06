/**
 * ============================================================================
 * 🚫 BLOCKED STATE CARD — Unified Blocking/Error UI
 * ============================================================================
 * 
 * P1.1: Single reusable component for ALL blocked/error states across gates.
 * 
 * USAGE:
 * - IdentityGate: SUPERADMIN, noContext, ERROR states
 * - TenantLayout: Tenant not found
 * - IdentityErrorScreen: All error variants
 * 
 * DESIGN PRINCIPLES:
 * - Uses i18n keys for ALL text (no hardcoded strings)
 * - Consistent visual hierarchy across all blocking states
 * - Supports up to 3 action buttons (primary, secondary, tertiary)
 * - Icon variants: destructive (red), warning (amber), muted (gray)
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

export interface BlockedStateAction {
  /** i18n key for button label */
  labelKey: string;
  /** Click handler */
  onClick: () => void;
  /** Button variant (default: 'default' for first, 'outline' for second, 'ghost' for third) */
  variant?: 'default' | 'outline' | 'ghost';
  /** Optional icon to show before label */
  icon?: LucideIcon;
}

export interface BlockedStateCardProps {
  /** Lucide icon component to display */
  icon: LucideIcon;
  /** Icon color variant */
  iconVariant?: 'destructive' | 'warning' | 'muted';
  /** i18n key for title */
  titleKey: string;
  /** i18n key for description */
  descriptionKey: string;
  /** Optional i18n key for hint/explainer text */
  hintKey?: string;
  /** Action buttons (max 3 recommended) */
  actions: BlockedStateAction[];
  /** Optional className for outer container */
  className?: string;
}

// =============================================================================
// ICON VARIANT STYLES
// =============================================================================

const iconVariantStyles = {
  destructive: {
    container: 'bg-destructive/10',
    icon: 'text-destructive',
  },
  warning: {
    container: 'bg-warning/10',
    icon: 'text-warning',
  },
  muted: {
    container: 'bg-muted',
    icon: 'text-muted-foreground',
  },
} as const;

// =============================================================================
// COMPONENT
// =============================================================================

export function BlockedStateCard({
  icon: Icon,
  iconVariant = 'destructive',
  titleKey,
  descriptionKey,
  hintKey,
  actions,
  className,
}: BlockedStateCardProps) {
  const { t } = useI18n();
  const styles = iconVariantStyles[iconVariant];

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
            <div
              className={cn(
                'mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center',
                styles.container
              )}
            >
              <Icon className={cn('h-8 w-8', styles.icon)} />
            </div>

            {/* Title */}
            <CardTitle className="text-xl">{t(titleKey)}</CardTitle>

            {/* Description */}
            <CardDescription className="text-base mt-2">
              {t(descriptionKey)}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            {/* Optional Hint Text */}
            {hintKey && (
              <p className="text-sm text-muted-foreground text-center mb-2">
                {t(hintKey)}
              </p>
            )}

            {/* Action Buttons */}
            {actions.map((action, index) => {
              const ActionIcon = action.icon;
              // Default variant based on position: first = default, second = outline, third+ = ghost
              const defaultVariant = index === 0 ? 'default' : index === 1 ? 'outline' : 'ghost';
              const variant = action.variant || defaultVariant;

              return (
                <Button
                  key={index}
                  onClick={action.onClick}
                  variant={variant}
                  className="w-full"
                >
                  {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
                  {t(action.labelKey)}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default BlockedStateCard;
