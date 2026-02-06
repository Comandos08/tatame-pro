/**
 * ============================================================================
 * 🚨 TEMPORARY ERROR CARD — UX for Transient Failures
 * ============================================================================
 * 
 * P2.5: Communicates temporary errors without causing panic.
 * 
 * SAFE GOLD PRINCIPLES:
 * - ❌ NO fetch calls
 * - ❌ NO automatic retry
 * - ❌ NO side effects
 * - ✅ Pure presentation
 * - ✅ User-triggered actions only
 * ============================================================================
 */

import React from 'react';
import { WifiOff, Clock, ServerCrash, AlertTriangle, AlertCircle, RefreshCw, Mail } from 'lucide-react';
import { BlockedStateCard, type BlockedStateAction } from './BlockedStateCard';
import { TEMPORARY_ERROR_MAP, type TemporaryErrorType } from '@/lib/errors/temporaryErrorMap';

// =============================================================================
// TYPES
// =============================================================================

export interface TemporaryErrorCardProps {
  /** Type of temporary error */
  type: TemporaryErrorType;
  /** Callback when user clicks retry */
  onRetry: () => void;
  /** Optional callback for secondary action (e.g., contact support) */
  onSecondaryAction?: () => void;
  /** Optional className for outer container */
  className?: string;
}

// =============================================================================
// ICON MAPPING
// =============================================================================

const errorTypeIcons = {
  NETWORK: WifiOff,
  TIMEOUT: Clock,
  SERVER: ServerCrash,
  RATE_LIMIT: AlertTriangle,
  UNKNOWN: AlertCircle,
} as const;

// =============================================================================
// COMPONENT
// =============================================================================

export function TemporaryErrorCard({
  type,
  onRetry,
  onSecondaryAction,
  className,
}: TemporaryErrorCardProps) {
  // Get config, fallback to UNKNOWN if type not found
  const config = TEMPORARY_ERROR_MAP[type] || TEMPORARY_ERROR_MAP.UNKNOWN;
  const Icon = errorTypeIcons[type] || AlertCircle;

  // Build actions array
  const actions: BlockedStateAction[] = [
    {
      labelKey: config.primaryActionKey,
      onClick: onRetry,
      variant: 'default',
      icon: RefreshCw,
    },
  ];

  // Add secondary action if configured and handler provided
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
