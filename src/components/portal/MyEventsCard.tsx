import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, ArrowRight, Trophy } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { EventRegistrationStatus, EVENT_REGISTRATION_STATUS_CONFIG } from '@/types/event';

interface MyEventsCardProps {
  athleteId?: string;
  tenantSlug: string;
  showFullHistoryLink?: boolean;
}

interface RegistrationWithEvent {
  id: string;
  status: EventRegistrationStatus;
  payment_status: string;
  created_at: string;
  event: {
    id: string;
    name: string;
    start_date: string;
    location: string | null;
    status: string;
  };
  category: {
    name: string;
  };
}

export function MyEventsCard({ athleteId, tenantSlug, showFullHistoryLink = false }: MyEventsCardProps) {
  const { t } = useI18n();

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ['my-event-registrations', athleteId],
    queryFn: async () => {
      if (!athleteId) return [];
      
      const { data, error } = await supabase
        .from('event_registrations')
        .select(`
          id,
          status,
          payment_status,
          created_at,
          event:events(id, name, start_date, location, status),
          category:event_categories(name)
        `)
        .eq('athlete_id', athleteId)
        .neq('status', 'CANCELED')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      
      // Transform data to match interface
      return (data || []).map(item => ({
        id: item.id,
        status: item.status as EventRegistrationStatus,
        payment_status: item.payment_status || 'PENDING',
        created_at: item.created_at,
        event: Array.isArray(item.event) ? item.event[0] : item.event,
        category: Array.isArray(item.category) ? item.category[0] : item.category,
      })).filter(item => item.event) as RegistrationWithEvent[];
    },
    enabled: !!athleteId,
  });

  // Query for past results
  const { data: results = [] } = useQuery({
    queryKey: ['my-event-results', athleteId],
    queryFn: async () => {
      if (!athleteId) return [];
      
      const { data, error } = await supabase
        .from('event_results')
        .select(`
          id,
          position,
          event:events(id, name, start_date),
          category:event_categories(name)
        `)
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        event: Array.isArray(item.event) ? item.event[0] : item.event,
        category: Array.isArray(item.category) ? item.category[0] : item.category,
      })).filter(item => item.event);
    },
    enabled: !!athleteId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: EventRegistrationStatus) => {
    const config = EVENT_REGISTRATION_STATUS_CONFIG[status];
    const colorClasses = {
      warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
      success: 'bg-green-500/10 text-green-600 dark:text-green-400',
      muted: 'bg-muted text-muted-foreground',
    };
    
    return (
      <Badge variant="outline" className={colorClasses[config.color]}>
        {config.label}
      </Badge>
    );
  };

  const getPaymentBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      PAID: { label: t('portal.paymentPaid'), className: 'bg-green-500/10 text-green-600 dark:text-green-400' },
      PENDING: { label: t('portal.paymentPending'), className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
      NOT_PAID: { label: t('portal.paymentNotPaid'), className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
    };
    const config = configs[status] || configs.NOT_PAID;
    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getPositionBadge = (position: number) => {
    const colors: Record<number, string> = {
      1: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
      2: 'bg-slate-400/20 text-slate-600 dark:text-slate-400 border-slate-400/30',
      3: 'bg-amber-700/20 text-amber-700 dark:text-amber-500 border-amber-700/30',
    };
    
    return (
      <Badge variant="outline" className={colors[position] || 'bg-muted'}>
        {position}º {t('events.place')}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('portal.myEvents')}
        </CardTitle>
        <CardDescription>
          {t('portal.myEventsDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent>
      {registrations.length === 0 && results.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>{t('portal.noEvents')}</p>
            <Button variant="link" asChild className="mt-2">
              <Link to={`/${tenantSlug}/events`}>
                {t('portal.viewEvents')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Registrations */}
            {registrations.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('portal.upcomingEvents')}
                </h4>
                {registrations.map((reg) => (
                  <div 
                    key={reg.id}
                    className="flex items-start justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{reg.event.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {format(new Date(reg.event.start_date), "dd 'de' MMM", { locale: ptBR })}
                        </span>
                        {reg.event.location && (
                          <>
                            <MapPin className="h-3 w-3 ml-1" />
                            <span>{reg.event.location}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('events.category')}: {reg.category?.name}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {getStatusBadge(reg.status)}
                      {getPaymentBadge(reg.payment_status)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  {t('portal.myResults')}
                </h4>
                {results.map((result: any) => (
                  <div 
                    key={result.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{result.event?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {result.category?.name} • {format(new Date(result.event?.start_date), "MMM yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    {getPositionBadge(result.position)}
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" asChild className="w-full">
              <Link to={showFullHistoryLink ? `/${tenantSlug}/portal/events` : `/${tenantSlug}/events`}>
                {showFullHistoryLink ? t('events.history') : t('portal.viewAllEvents')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
