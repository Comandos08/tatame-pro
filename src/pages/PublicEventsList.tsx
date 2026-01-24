import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Search } from 'lucide-react';

import PublicHeader from '@/components/PublicHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EventCard } from '@/components/events/EventCard';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { Event } from '@/types/event';

export default function PublicEventsList() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [search, setSearch] = React.useState('');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['public-events', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // RLS will filter to only public events with valid status
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('start_date', { ascending: true });
      
      if (error) throw error;
      return data as Event[];
    },
    enabled: !!tenant?.id,
  });

  const filteredEvents = events.filter(event =>
    event.name.toLowerCase().includes(search.toLowerCase()) ||
    event.location?.toLowerCase().includes(search.toLowerCase())
  );

  // Separate upcoming and past events
  const now = new Date();
  const upcomingEvents = filteredEvents.filter(e => new Date(e.end_date) >= now);
  const pastEvents = filteredEvents.filter(e => new Date(e.end_date) < now);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-display font-bold flex items-center justify-center gap-3">
              <Calendar className="h-8 w-8" />
              {t('events.publicTitle' as any) || 'Eventos'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('events.publicDesc' as any) || `Competições e seminários da ${tenant?.name || 'organização'}`}
            </p>
          </div>

          {/* Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('events.searchEvents' as any) || 'Buscar eventos...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          {/* Loading */}
          {isLoading && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-32 w-full mb-4" />
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* No events */}
          {!isLoading && events.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <h3 className="mt-4 text-lg font-medium">
                  {t('events.noPublicEvents' as any) || 'Nenhum evento disponível'}
                </h3>
                <p className="text-muted-foreground mt-2">
                  {t('events.noPublicEventsDesc' as any) || 'Novos eventos serão publicados em breve'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-4">
                {t('events.upcomingEvents' as any) || 'Próximos Eventos'}
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    tenantSlug={tenant?.slug || ''}
                    isAdmin={false}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past Events */}
          {pastEvents.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-4 text-muted-foreground">
                {t('events.pastEvents' as any) || 'Eventos Anteriores'}
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    tenantSlug={tenant?.slug || ''}
                    isAdmin={false}
                  />
                ))}
              </div>
            </section>
          )}
        </motion.div>
      </main>
    </div>
  );
}
