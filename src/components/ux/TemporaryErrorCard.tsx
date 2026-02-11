/**
 * ============================================================================
 * 🚨 TEMPORARY ERROR CARD — UX for Transient Failures
 * ============================================================================
 * 
 * P2.5: Communicates temporary errors without causing panic.
 * 
 * CONTRACT:
 * - No fetch
 * - No retry automation
 * - No state mutation
 * - All actions are explicit and delegated
 * 
 * SAFE GOLD:
 * Removing this component must not affect system behavior.
 * 
 * USAGE:
 * ```tsx
 * <TemporaryErrorCard
 *   type="NETWORK"
 *   onRetry={() => refetch()}
 *   onSecondaryAction={() => openSupport()}
 * />
 * ```
 * ============================================================================
 */

import React from 'react';
import { WifiOff, Clock, ServerCrash, AlertTriangle, AlertCircle, RefreshCw, Mail, type LucideIcon } from 'lucide-react';
import { BlockedStateCard, type BlockedStateAction } from './BlockedStateCard';
import { TEMPORARY_ERROR_MAP, type TemporaryErrorType } from '@/lib/errors/temporaryErrorMap';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface TemporaryErrorCardProps {
  /** Type of temporary error */
  type: TemporaryErrorType;
  /** Callback when user clicks retry (required for primary action) */
  onRetry: () => void;
  /** Optional callback for secondary action (e.g., contact support) */
  onSecondaryAction?: () => void;
  /** Optional className for outer container */
  className?: string;
}

// =============================================================================
// ICON MAPPING
// =============================================================================

const errorTypeIcons: Record<TemporaryErrorType, LucideIcon> = {
  NETWORK: WifiOff,
  TIMEOUT: Clock,
  SERVER: ServerCrash,
  RATE_LIMIT: AlertTriangle,
  UNKNOWN: AlertCircle,
};

// =============================================================================
// COMPONENT
// =============================================================================

export function TemporaryErrorCard({
  type,
  onRetry,
  onSecondaryAction,
  className,
}: TemporaryErrorCardProps) {
  // DEV-only guard: warn if onRetry is missing (logger gates by env)
  if (!onRetry) {
    logger.warn(
      '[TemporaryErrorCard] onRetry is required for primary action. Component may not behave as expected.',
    );
  }

  // Defensive fallback: resolve to UNKNOWN if type not in map
  const resolvedType: TemporaryErrorType =
    TEMPORARY_ERROR_MAP[type] ? type : 'UNKNOWN';

  const config = TEMPORARY_ERROR_MAP[resolvedType];
  const Icon = errorTypeIcons[resolvedType];

  // Build actions array
  const actions: BlockedStateAction[] = [];

  // Primary action (retry)
  if (onRetry) {
    actions.push({
      labelKey: config.primaryActionKey,
      onClick: onRetry,
      variant: 'default',
      icon: RefreshCw,
    });
  }

  // Secondary action (contact support) - only if configured and handler provided
  if (config.secondaryActionKey && onSecondaryAction) {
    actions.push({
      labelKey: config.secondaryActionKey,
      onClick: onSecondaryAction,
      variant: 'outline',
      icon: Mail,
    });
  }

  return (
    <BlockedStateCard
      icon={Icon}
      iconVariant="warning"
      titleKey={config.titleKey}
      descriptionKey={config.descriptionKey}
      hintKey={config.reassuranceKey}
      actions={actions}
      className={className}
    />
  );
}

export default TemporaryErrorCard;
