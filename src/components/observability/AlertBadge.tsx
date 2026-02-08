/**
 * 🔔 AlertBadge — P4.1.D
 * 
 * Badge component showing active alert count.
 * For use in headers/sidebars.
 */

import React from 'react';
import { Bell, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlertsOptional } from '@/contexts/AlertContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/contexts/I18nContext';

interface AlertBadgeProps {
  onClick?: () => void;
  showZero?: boolean;
  className?: string;
}

export function AlertBadge({ onClick, showZero = false, className }: AlertBadgeProps) {
  const { t } = useI18n();
  const alertContext = useAlertsOptional();
  
  // If AlertProvider not available, don't render
  if (!alertContext) return null;
  
  const { activeCount, criticalCount, isLoading } = alertContext;
  
  // Hide if no alerts and showZero is false
  if (!showZero && activeCount === 0 && !isLoading) {
    return null;
  }
  
  const hasCritical = criticalCount > 0;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={cn('relative', className)}
        >
          {hasCritical ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {activeCount > 0 && (
            <span className={cn(
              'absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center',
              hasCritical 
                ? 'bg-destructive text-destructive-foreground' 
                : 'bg-warning text-warning-foreground'
            )}>
              {activeCount > 99 ? '99+' : activeCount}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {activeCount === 0 
          ? t('observability.alerts.noAlerts')
          : `${activeCount} ${t('observability.alerts.activeAlerts')}`
        }
      </TooltipContent>
    </Tooltip>
  );
}
