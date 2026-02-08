/**
 * 🔔 AlertBadge — P4.1.D / P4.2.C / P4.3.1
 * 
 * Badge component showing active alert count with realtime indicator.
 * For use in headers/sidebars.
 * 
 * INVARIANT (P4.3.1): This is the ONLY component that renders data-conn-state.
 * AlertsPanel must NOT render data-conn-state to ensure single-element contract.
 */

import React from 'react';
import { Bell, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlertsOptional } from '@/contexts/AlertContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/contexts/I18nContext';
import { resolveConnectionState, type ConnectionState } from '@/types/connection-state';

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
  
  const { activeCount, criticalCount, isLoading, isRealtimeConnected, newEventsCount } = alertContext;
  
  // Hide if no alerts and showZero is false
  if (!showZero && activeCount === 0 && !isLoading) {
    return null;
  }
  
  const hasCritical = criticalCount > 0;
  const hasNewEvents = newEventsCount > 0;
  
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
            <Bell className={cn('h-5 w-5', hasNewEvents && 'text-primary')} />
          )}
          
          {/* Alert count badge */}
          {activeCount > 0 && (
            <span className={cn(
              'absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center',
              hasCritical 
                ? 'bg-destructive text-destructive-foreground' 
                : hasNewEvents
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-warning text-warning-foreground'
            )}>
              {activeCount > 99 ? '99+' : activeCount}
            </span>
          )}
          
          {/* Realtime connection indicator - CANONICAL data-conn-state element */}
          {(() => {
            const connState: ConnectionState = resolveConnectionState(isRealtimeConnected);
            return (
              <span 
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background',
                  connState === 'live' 
                    ? 'bg-success' 
                    : 'bg-muted-foreground animate-pulse'
                )}
                data-conn-state={connState}
                title={isRealtimeConnected 
                  ? t('observability.realtime.connected') 
                  : t('observability.realtime.syncing')
                }
              />
            );
          })()}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        <span>
          {activeCount === 0 
            ? t('observability.alerts.noAlerts')
            : `${activeCount} ${t('observability.alerts.activeAlerts')}`
          }
        </span>
        {isRealtimeConnected ? (
          <Wifi className="h-3 w-3 text-success" />
        ) : (
          <WifiOff className="h-3 w-3 text-muted-foreground" />
        )}
      </TooltipContent>
    </Tooltip>
  );
}
