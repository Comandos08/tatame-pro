/**
 * 🔔 AlertsPanel — P4.1.D / P4.2.C
 * 
 * Panel/modal showing list of alerts with dismiss functionality
 * and realtime "new events" indicator.
 */

import React from 'react';
import { X, AlertTriangle, XCircle, Info, Bell, RefreshCw, Trash2, Wifi, WifiOff, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlerts } from '@/contexts/AlertContext';
import { useI18n } from '@/contexts/I18nContext';
import { Alert, EventSeverity } from '@/types/observability';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { formatDistanceToNow } from 'date-fns';

const severityConfig: Record<EventSeverity, { 
  icon: React.ElementType; 
  color: string; 
  bg: string;
  border: string;
}> = {
  CRITICAL: { 
    icon: XCircle, 
    color: 'text-destructive', 
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
  },
  HIGH: { 
    icon: AlertTriangle, 
    color: 'text-warning', 
    bg: 'bg-warning/10',
    border: 'border-warning/30',
  },
  MEDIUM: { 
    icon: AlertTriangle, 
    color: 'text-orange-500', 
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  LOW: { 
    icon: Info, 
    color: 'text-muted-foreground', 
    bg: 'bg-muted',
    border: 'border-muted-foreground/30',
  },
};

function AlertItem({ 
  alert, 
  onDismiss 
}: { 
  alert: Alert; 
  onDismiss: (id: string) => void;
}) {
  const config = severityConfig[alert.severity] || severityConfig.LOW;
  const Icon = config.icon;
  
  if (alert.dismissed) return null;
  
  return (
    <div 
      className={cn(
        'p-3 rounded-lg border relative',
        config.bg,
        config.border,
      )}
      data-alert-id={alert.id}
      data-alert-severity={alert.severity}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 mt-0.5', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-sm">{alert.title}</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {alert.severity}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{alert.description}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-50 hover:opacity-100"
          onClick={() => onDismiss(alert.id)}
          data-dismiss-alert={alert.id}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AlertsPanel({ 
  trigger 
}: { 
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const { 
    alerts, 
    activeCount, 
    criticalCount, 
    refreshAlerts, 
    dismissAlert, 
    clearDismissed, 
    isLoading,
    isRealtimeConnected,
    newEventsCount,
    markNewEventsAsSeen,
  } = useAlerts();
  
  const activeAlerts = alerts.filter(a => !a.dismissed);
  const dismissedAlerts = alerts.filter(a => a.dismissed);
  
  // Sort: critical first, then by timestamp
  const sortedAlerts = [...activeAlerts].sort((a, b) => {
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const severityDiff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {activeCount > 0 && (
              <span className={cn(
                'absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center',
                criticalCount > 0 
                  ? 'bg-destructive text-destructive-foreground' 
                  : 'bg-warning text-warning-foreground'
              )}>
                {activeCount}
              </span>
            )}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:max-w-[400px]">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {t('observability.alerts.title')}
            </SheetTitle>
            <div className="flex items-center gap-1">
          {/* Connection status badge */}
          {isRealtimeConnected ? (
            <Badge 
              variant="outline" 
              className="text-success border-success text-[10px] px-1.5"
              data-conn-state="live"
            >
              <Wifi className="h-3 w-3 mr-1" />
              {t('observability.realtime.live')}
            </Badge>
          ) : (
            <Badge 
              variant="outline" 
              className="text-muted-foreground text-[10px] px-1.5"
              data-conn-state="polling"
            >
              <WifiOff className="h-3 w-3 mr-1" />
              {t('observability.realtime.polling')}
            </Badge>
          )}
              
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshAlerts}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>
              {dismissedAlerts.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearDismissed}
                  title={t('observability.alerts.clearDismissed')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <SheetDescription>
            {activeCount === 0 
              ? t('observability.alerts.noActiveAlerts')
              : `${activeCount} ${t('observability.alerts.activeAlerts')}`
            }
          </SheetDescription>
          
          {/* New events indicator */}
          {newEventsCount > 0 && (
            <div className="flex items-center justify-between bg-primary/10 rounded-lg px-3 py-2 mt-2">
              <span className="text-sm font-medium text-primary">
                {newEventsCount} {t('observability.realtime.newEvents')}
              </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={markNewEventsAsSeen}
              className="h-7 text-xs"
              data-testid="mark-seen-button"
            >
              <Eye className="h-3 w-3 mr-1" />
              {t('observability.realtime.markSeen')}
            </Button>
            </div>
          )}
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-180px)] mt-4">
          {sortedAlerts.length === 0 ? (
            <div 
              className="flex flex-col items-center justify-center py-12 text-muted-foreground"
              data-testid="alerts-empty-state"
            >
              <Bell className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm">{t('observability.alerts.allClear')}</p>
              <p className="text-xs mt-1">{t('observability.alerts.allClearHint')}</p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {sortedAlerts.map(alert => (
                <AlertItem 
                  key={alert.id} 
                  alert={alert} 
                  onDismiss={dismissAlert}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
