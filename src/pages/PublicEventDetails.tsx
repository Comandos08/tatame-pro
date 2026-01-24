import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, ArrowLeft, Users } from 'lucide-react';

import PublicHeader from '@/components/PublicHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EventStatusBadge } from '@/components/events/EventStatusBadge';
import { EventRegistrationButton } from '@/components/events/EventRegistrationButton';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { Event, EventCategory, EventStatus } from '@/types/event';

export default function PublicEventDetails() {
  const { eventId } = useParams<{ eventId: string }>();
  const { tenant } = useTenant();
  const { t } = useI18n();

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['public-event', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      return data as Event | null;
    },
    enabled: !!eventId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['public-event-categories', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_categories')
        .select('*')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data as EventCategory[];
    },
    enabled: !!eventId,
  });

  // Count registrations per category
  const { data: registrationCounts = {} } = useQuery({
    queryKey: ['public-event-registration-counts', eventId],
    queryFn: async () => {
      if (!eventId) return {};
      const { data, error } = await supabase
        .from('event_registrations')
        .select('category_id')
        .eq('event_id', eventId)
        .neq('status', 'CANCELED');
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(reg => {
        counts[reg.category_id] = (counts[reg.category_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!eventId,
  });

  if (eventLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <main className="container mx-auto px-4 py-8 max-w-4xl text-center">
          <h1 className="text-2xl font-bold mb-4">
            {t('events.notFound' as any) || 'Evento não encontrado'}
          </h1>
          <Button asChild>
            <Link to={`/${tenant?.slug}/events`}>{t('common.back')}</Link>
          </Button>
        </main>
      </div>
    );
  }

  const startDate = new Date(event.start_date);
  const endDate = new Date(event.end_date);
  const isSameDay = format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd');

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Back link */}
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/${tenant?.slug}/events`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('events.backToEvents' as any) || 'Voltar aos eventos'}
            </Link>
          </Button>

          {/* Banner */}
          {event.banner_url && (
            <div className="aspect-video w-full rounded-lg overflow-hidden">
              <img 
                src={event.banner_url} 
                alt={event.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-display font-bold">{event.name}</h1>
                <EventStatusBadge status={event.status as EventStatus} />
              </div>
              {event.sport_type && (
                <Badge variant="outline">{event.sport_type}</Badge>
              )}
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {t('events.dateTime' as any) || 'Data e Horário'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isSameDay ? (
                  <p className="font-medium">
                    {format(startDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </p>
                ) : (
                  <div>
                    <p className="font-medium">
                      {format(startDate, "dd 'de' MMMM", { locale: ptBR })} até{' '}
                      {format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {t('events.location' as any) || 'Local'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{event.location || 'A definir'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          {event.description && (
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.description') || 'Descrição'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{event.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t('events.categories' as any) || 'Categorias'}
                </CardTitle>
                <CardDescription>
                  {t('events.selectCategoryToRegister' as any) || 'Selecione uma categoria para se inscrever'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {categories.map((category) => {
                    const count = registrationCounts[category.id] || 0;
                    const isFull = category.max_participants && count >= category.max_participants;
                    
                    return (
                      <div 
                        key={category.id}
                        className={`p-4 rounded-lg border ${isFull ? 'bg-muted' : 'bg-card'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{category.name}</p>
                            {category.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {category.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                              <Users className="h-3 w-3" />
                              <span>
                                {count}{category.max_participants ? `/${category.max_participants}` : ''} {t('events.registered' as any) || 'inscritos'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            {category.price_cents > 0 ? (
                              <p className="font-semibold">
                                {new Intl.NumberFormat('pt-BR', { 
                                  style: 'currency', 
                                  currency: category.currency 
                                }).format(category.price_cents / 100)}
                              </p>
                            ) : (
                              <Badge variant="secondary">
                                {t('events.free' as any) || 'Grátis'}
                              </Badge>
                            )}
                            {isFull && (
                              <Badge variant="destructive" className="mt-1">
                                {t('events.full' as any) || 'Lotado'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Registration Button */}
          <Card>
            <CardHeader>
              <CardTitle>{t('events.registration' as any) || 'Inscrição'}</CardTitle>
            </CardHeader>
            <CardContent>
              <EventRegistrationButton
                eventId={event.id}
                eventStatus={event.status as EventStatus}
                tenantId={event.tenant_id}
                categories={categories}
              />
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
