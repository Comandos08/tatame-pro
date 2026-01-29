/**
 * ActionBlockedTooltip - Wrapper component for blocked actions during trial expiration
 * 
 * Wraps a button or interactive element and shows a tooltip explaining
 * why the action is blocked when the tenant's trial has expired.
 */

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useI18n } from '@/contexts/I18nContext';
import { useTrialRestrictions } from '@/hooks/useTrialRestrictions';
import { Lock } from 'lucide-react';

interface ActionBlockedTooltipProps {
  children: React.ReactNode;
  /** Override the default isBlocked check */
  forceBlocked?: boolean;
  /** Custom message to show in tooltip */
  customMessage?: string;
}

export function ActionBlockedTooltip({ 
  children, 
  forceBlocked,
  customMessage 
}: ActionBlockedTooltipProps) {
  const { t } = useI18n();
  const { isRestricted, isPendingDelete, restrictionReason } = useTrialRestrictions();
  
  const isBlocked = forceBlocked ?? (isRestricted || isPendingDelete);
  
  if (!isBlocked) {
    return <>{children}</>;
  }

  const message = customMessage || (
    restrictionReason === 'pending_delete'
      ? t('trial.pendingDeleteDesc')
      : t('trial.actionBlockedDesc')
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative inline-flex">
            <div className="opacity-50 pointer-events-none">
              {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded">
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs text-center">{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Hook to get disabled state and props for blocked actions
 */
export function useActionBlockedState() {
  const { isRestricted, isPendingDelete, restrictionReason } = useTrialRestrictions();
  const { t } = useI18n();
  
  const isBlocked = isRestricted || isPendingDelete;
  
  return {
    isBlocked,
    disabledProps: isBlocked ? {
      disabled: true,
      title: restrictionReason === 'pending_delete'
        ? t('trial.pendingDeleteDesc')
        : t('trial.actionBlockedDesc'),
    } : {},
    restrictionReason,
  };
}
