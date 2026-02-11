/**
 * 🔍 CriticalEventsCard — P4.1.C
 * 
 * Card showing recent critical events from the observability_critical_events view.
 */

import React from 'react';
import { logger } from '@/lib/logger';
import { AlertTriangle, XCircle, Info, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/contexts/I18nContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatRelativeTime } from '@/lib/i18n/formatters';
import { cn } from '@/lib/utils';

interface CriticalEvent {
  id: string;
  source: string;
  event_type: string;
  category: string;
  tenant_id: string | null;
  created_at: string;
  severity: string;
}

const severityConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  CRITICAL: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  HIGH: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  MEDIUM: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  LOW: { icon: Info, color: 'text-muted-foreground', bg: 'bg-muted' },
};

function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function EventRow({ event }: { event: CriticalEvent }) {
  const { locale } = useI18n();
  const config = severityConfig[event.severity] || severityConfig.LOW;
  const Icon = config.icon;
  
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <div className={cn('p-1.5 rounded-md', config.bg)}>
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {formatEventType(event.event_type)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {event.category}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.created_at, locale)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CriticalEventsCard() {
  const { t } = useI18n();
  
  const { data: events, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['critical-events-card'],
    queryFn: async (): Promise<CriticalEvent[]> => {
      const { data, error } = await supabase
        .from('observability_critical_events')
        .select('id, source, event_type, category, tenant_id, created_at, severity')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) {
        logger.error('[CriticalEventsCard] Query error:', error.message);
        return [];
      }
      
      return (data || []) as CriticalEvent[];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  
  const criticalCount = events?.filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH').length || 0;
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <CardTitle className="text-base">{t('observability.events.title')}</CardTitle>
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {criticalCount}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
        <CardDescription className="text-xs">
          {t('observability.events.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : events && events.length > 0 ? (
          <div className="space-y-1">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('observability.events.noEvents')}</p>
            <p className="text-xs mt-1">{t('observability.events.noEventsHint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
