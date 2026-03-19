import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Search, AlertCircle, UserX } from 'lucide-react';

import PublicHeader from '@/components/PublicHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EventCard } from '@/components/events/EventCard';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { LoadingState } from '@/components/ux/LoadingState';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useHasAthleteInTenant } from '@/hooks/useHasAthleteInTenant';
import { Event } from '@/types/event';

export default function PublicEventsList() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [search, setSearch] = React.useState('');

  // Guard clause - tenant required
  if (!tenant) return <LoadingState titleKey="common.loading" />;

  const { isAuthenticated } = useCurrentUser();
  const { 
    hasAthleteInTenant, 
    hasAthleteAnywhere, 
    isLoading: athleteCheckLoading 
  } = useHasAthleteInTenant(tenant?.id);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['public-events', tenant.slug],
    queryFn: async () => {
      // Query with proper filters - RLS handles tenant isolation
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_public', true)
        .not('status', 'in', '(DRAFT,ARCHIVED)')
        .order('start_date', { ascending: true });
      
      if (error) throw error;
      return data as Event[];
    },
    enabled: !!tenant.id,
  });

  // Loading composto: aguardar auth + athlete check (Ajuste C)
  const isPageLoading = isLoading || (isAuthenticated && athleteCheckLoading);

  // Condições de bloqueio (apenas para usuários logados)
  const isBlockedWrongTenant = isAuthenticated && !athleteCheckLoading && 
    hasAthleteAnywhere === true && hasAthleteInTenant === false;

  const isBlockedNoAffiliation = isAuthenticated && !athleteCheckLoading && 
    hasAthleteAnywhere === false;

  // Usuário logado sem vínculo em NENHUMA organização (Ajuste B)
  if (isBlockedNoAffiliation) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader tenant={tenant} showBackButton backTo={`/${tenant.slug}`} />
        <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
          <Card>
            <CardContent className="py-12 text-center">
              <UserX className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">
                {t('events.noAffiliation')}
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                {t('events.noAffiliationDesc')}
              </p>
              <Button asChild className="mt-6">
                <Link to={`/${tenant.slug}/membership`}>
                  {t('portal.startMembership')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Usuário logado COM vínculo, mas em OUTRA organização
  if (isBlockedWrongTenant) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader tenant={tenant} showBackButton backTo={`/${tenant.slug}`} />
        <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">
                {t('events.notAvailable')}
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                {t('events.notAvailableForYourOrganization')}
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link to={`/${tenant.slug}/portal`}>
                  {t('portal.title')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const filteredEvents = events.filter(event =>
    event.name.toLowerCase().includes(search.toLowerCase()) ||
    event.location?.toLowerCase().includes(search.toLowerCase())
  );

  // Separate upcoming and past events
  const now = new Date();
  const upcomingEvents = filteredEvents.filter(e => new Date(e.end_date) >= now);
  const pastEvents = filteredEvents.filter(e => new Date(e.end_date) < now);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader tenant={tenant} showBackButton backTo={`/${tenant.slug}`} />
      
      <main className="container mx-auto px-4 py-8 max-w-6xl flex-1">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="text-center">
            <div 
              className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4"
              style={{ backgroundColor: `${tenant.primaryColor}20` }}
            >
              <Calendar className="h-8 w-8" style={{ color: tenant.primaryColor }} />
            </div>
            <h1 className="text-3xl font-display font-bold">
              {t('events.publicTitle')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('events.publicDesc')} — {tenant.name}
            </p>
          </div>

          {/* Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="relative max-w-md mx-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('events.searchEvents')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          {/* Loading composto */}
          {isPageLoading && (
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

          {/* Results counter */}
          {!isPageLoading && filteredEvents.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {filteredEvents.length} {filteredEvents.length === 1 
                ? t('events.eventFound') 
                : t('events.eventsFound')}
            </p>
          )}

          {/* No events */}
          {!isPageLoading && events.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <h3 className="mt-4 text-lg font-medium">
                  {t('events.noPublicEvents')}
                </h3>
                <p className="text-muted-foreground mt-2">
                  {t('events.noPublicEventsDesc')}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Events */}
          {!isPageLoading && upcomingEvents.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-4">
                {t('events.upcomingEvents')}
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    tenantSlug={tenant.slug}
                    isAdmin={false}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past Events */}
          {!isPageLoading && pastEvents.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-4 text-muted-foreground">
                {t('events.pastEvents')}
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    tenantSlug={tenant.slug}
                    isAdmin={false}
                  />
                ))}
              </div>
            </section>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant.name}. Powered by{' '}
            <Link to="/" className="text-primary hover:underline">TATAME</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
