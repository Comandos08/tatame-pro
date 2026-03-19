
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, MapPin, ArrowLeft, Users, Info, CheckCircle, AlertCircle, UserX, GitBranch } from 'lucide-react';

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
import { formatDate, formatCurrency } from '@/lib/i18n/formatters';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useHasAthleteInTenant } from '@/hooks/useHasAthleteInTenant';
import { Event, EventCategory, EventStatus } from '@/types/event';

export default function PublicEventDetails() {
  const { eventId } = useParams<{ eventId: string }>();
  const { tenant } = useTenant();
  const { t, locale } = useI18n();

  const { isAuthenticated } = useCurrentUser();
  const { 
    hasAthleteInTenant, 
    hasAthleteAnywhere, 
    isLoading: athleteCheckLoading 
  } = useHasAthleteInTenant(tenant?.id);

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

  // P2.1 — Check if published brackets exist for this event
  const { data: publishedBracketsCount = 0 } = useQuery({
    queryKey: ['public-brackets-count', eventId],
    queryFn: async () => {
      if (!eventId) return 0;
      const { count } = await supabase
        .from('event_brackets')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'PUBLISHED');
      return count ?? 0;
    },
    enabled: !!eventId,
  });

  // Loading composto: event + auth + athlete check (Ajuste C)
  const isPageLoading = eventLoading || (isAuthenticated && athleteCheckLoading);

  // Condições de bloqueio
  const isBlockedWrongTenant = isAuthenticated && !athleteCheckLoading && 
    hasAthleteAnywhere === true && hasAthleteInTenant === false;

  const isBlockedNoAffiliation = isAuthenticated && !athleteCheckLoading && 
    hasAthleteAnywhere === false;

  // Loading composto (Ajuste C)
  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  // Usuário logado sem vínculo em NENHUMA organização (Ajuste B)
  if (isBlockedNoAffiliation) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
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
                <Link to={`/${tenant?.slug}/membership`}>
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
        <PublicHeader />
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

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="container mx-auto px-4 py-8 max-w-4xl text-center flex-1">
          <h1 className="text-2xl font-bold mb-4">
            {t('events.notFound')}
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
  const isSameDay = startDate.toISOString().split('T')[0] === endDate.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl flex-1">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Back link */}
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/${tenant?.slug}/events`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('events.backToEvents')}
            </Link>
          </Button>

          {/* Banner */}
          {event.banner_url ? (
            <div className="aspect-video w-full rounded-lg overflow-hidden">
              <img 
                src={event.banner_url} 
                alt={event.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video w-full rounded-lg bg-muted/50 flex items-center justify-center">
              <Calendar className="h-16 w-16 text-muted-foreground/30" />
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
                  {t('events.dateTime')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isSameDay ? (
                  <p className="font-medium">
                    {formatDate(startDate, locale, { dateStyle: 'long' })}
                  </p>
                ) : (
                  <div>
                    <p className="font-medium">
                      {formatDate(startDate, locale)} {t('events.until')}{' '}
                      {formatDate(endDate, locale, { dateStyle: 'long' })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {t('events.location')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{event.location || t('common.tbd')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          {event.description && (
            <Card>
              <CardHeader>
                <CardTitle>{t('events.description')}</CardTitle>
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
                  {t('events.details.categories')}
                </CardTitle>
                <CardDescription>
                  {t('events.selectCategoryToRegister')}
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
                                {count}
                                {category.max_participants 
                                  ? `/${category.max_participants}` 
                                  : ` — ${t('events.details.noLimit')}`
                                } {t('events.registered')}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            {category.price_cents > 0 ? (
                              <p className="font-semibold">
                                {formatCurrency(category.price_cents, locale, category.currency)}
                              </p>
                            ) : (
                              <Badge variant="secondary">
                                {t('events.free')}
                              </Badge>
                            )}
                            {isFull && (
                              <Badge variant="destructive" className="mt-1">
                                {t('events.full')}
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

          {/* Requirements Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                {t('events.details.requirements')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{t('events.details.req1')}</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{t('events.details.req2')}</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{t('events.details.req3')}</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{t('events.details.req4')}</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Registration CTA - Integrated Component */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {t('events.registerForEvent')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EventRegistrationButton
                eventId={event.id}
                eventStatus={event.status as EventStatus}
                tenantId={tenant?.id || ''}
                categories={categories}
                tenantSlug={tenant?.slug || ''}
              />
            </CardContent>
          </Card>

          {/* P2.1 — Bracket link: shown when published brackets exist */}
          {publishedBracketsCount > 0 && (
            <Button variant="outline" className="w-full gap-2" asChild>
              <Link to={`/${tenant?.slug}/events/${event.id}/brackets`}>
                <GitBranch className="h-4 w-4" />
                {t('events.viewBrackets') || 'Ver chaves do torneio'}
              </Link>
            </Button>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant?.name}. Powered by{' '}
            <Link to="/" className="text-primary hover:underline">TATAME</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
