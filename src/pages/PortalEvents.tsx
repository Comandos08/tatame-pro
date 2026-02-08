import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Calendar, MapPin, ArrowLeft, Trophy, Filter, History } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { PortalLayout } from '@/layouts/PortalLayout';
import { PortalAccessGate } from '@/components/portal/PortalAccessGate';
import { useAthleteEvents, RegistrationWithEvent, ResultWithEvent } from '@/hooks/useAthleteEvents';
import { RegistrationStatusBadge } from '@/components/events/RegistrationStatusBadge';
import { EventExpectationCard } from '@/components/events/EventExpectationCard';
import { EventRegistrationStatus } from '@/types/event';

interface AthleteData {
  id: string;
  full_name: string;
  tenant_id: string;
}

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  created_at: string;
}

export default function PortalEvents() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t, locale } = useI18n();

  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showWithResults, setShowWithResults] = useState<boolean>(false);

  const getDateLocale = () => {
    switch (locale) {
      case 'en': return enUS;
      case 'es': return es;
      default: return ptBR;
    }
  };

  // Query athlete
  const { data: athlete, isLoading: athleteLoading, error: athleteError } = useQuery<AthleteData | null>({
    queryKey: ['portal-athlete', currentUser?.id, tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('id, full_name, tenant_id')
        .eq('profile_id', currentUser!.id)
        .eq('tenant_id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentUser?.id && !!tenant?.id,
  });

  // Query membership for access gate
  const { data: membership, isLoading: membershipLoading } = useQuery<MembershipData | null>({
    queryKey: ['portal-membership-events', athlete?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, status, payment_status, start_date, end_date, type, created_at')
        .eq('athlete_id', athlete!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!athlete?.id,
  });

  // Use the shared hook without limit
  const { registrations, results, isLoading: eventsLoading } = useAthleteEvents(athlete?.id);

  const isLoading = athleteLoading || membershipLoading || eventsLoading;

  // Get unique years for filter
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    registrations.forEach(r => {
      if (r.event?.start_date) {
        years.add(new Date(r.event.start_date).getFullYear().toString());
      }
    });
    results.forEach(r => {
      if (r.event?.start_date) {
        years.add(new Date(r.event.start_date).getFullYear().toString());
      }
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [registrations, results]);

  // Filter registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter(reg => {
      if (yearFilter !== 'all') {
        const year = new Date(reg.event.start_date).getFullYear().toString();
        if (year !== yearFilter) return false;
      }
      if (statusFilter !== 'all' && reg.status !== statusFilter) {
        return false;
      }
      if (showWithResults) {
        // Check if this event has a result for this athlete
        const hasResult = results.some(r => r.event.id === reg.event.id);
        if (!hasResult) return false;
      }
      return true;
    });
  }, [registrations, results, yearFilter, statusFilter, showWithResults]);

  // Filter results
  const filteredResults = useMemo(() => {
    return results.filter(result => {
      if (yearFilter !== 'all') {
        const year = new Date(result.event.start_date).getFullYear().toString();
        if (year !== yearFilter) return false;
      }
      return true;
    });
  }, [results, yearFilter]);


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

  if (!tenant) return null;

  return (
    <PortalLayout
      athleteName={athlete?.full_name || 'Atleta'}
      tenantName={tenant.name}
      tenantLogo={tenant.logoUrl}
      tenantSlug={tenant.slug}
      data-testid="portal-events"
    >
      <PortalAccessGate
        athlete={athlete ?? null}
        membership={membership ?? null}
        isLoading={isLoading}
        error={athleteError as Error | null}
      >
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link to={`/${tenant.slug}/portal`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Link>
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <History className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">{t('events.history')}</h1>
              <p className="text-muted-foreground">{t('events.historyDesc')}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" />
              {t('common.filter')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[140px]">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  {t('events.filterYear')}
                </label>
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {availableYears.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[160px]">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  {t('events.filterStatus')}
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="PENDING">{t('events.registration.pending')}</SelectItem>
                    <SelectItem value="CONFIRMED">{t('events.registration.confirmed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant={showWithResults ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowWithResults(!showWithResults)}
                  className="gap-2"
                >
                  <Trophy className="h-4 w-4" />
                  {t('events.filterWithResults')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {eventsLoading ? (
          <Card>
            <CardContent className="py-8">
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : filteredRegistrations.length === 0 && filteredResults.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Calendar className="h-16 w-16 mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium mb-2">{t('events.noEventsYet')}</p>
                <p className="text-sm mb-6">{t('events.noEventsYetDesc')}</p>
                <Button asChild>
                  <Link to={`/${tenant.slug}/events`}>
                    {t('portal.viewEvents')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Registrations */}
            {filteredRegistrations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      {t('portal.myEvents')}
                    </CardTitle>
                    <CardDescription>
                      {filteredRegistrations.length} {t('events.registrations').toLowerCase()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {filteredRegistrations.map((reg) => (
                        <div
                          key={reg.id}
                          className="space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border bg-card gap-3">
                            <div className="space-y-1 flex-1">
                              <p className="font-medium">{reg.event.name}</p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(reg.event.start_date), "dd MMM yyyy", { locale: getDateLocale() })}
                                </span>
                                {reg.event.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {reg.event.location}
                                  </span>
                                )}
                                <span>• {reg.category?.name}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <RegistrationStatusBadge status={reg.status as EventRegistrationStatus} size="sm" />
                              {getPaymentBadge(reg.payment_status)}
                            </div>
                          </div>
                          {/* P2.3 — Expectation Card: "O que acontece agora?" */}
                          {(reg.status === 'PENDING' || reg.status === 'CONFIRMED') && (
                            <EventExpectationCard 
                              registrationStatus={reg.status as EventRegistrationStatus} 
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Results */}
            {filteredResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      {t('portal.myResults')}
                    </CardTitle>
                    <CardDescription>
                      {filteredResults.length} {t('events.results').toLowerCase()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {filteredResults.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card"
                        >
                          <div className="space-y-1">
                            <p className="font-medium">{result.event?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {result.category?.name} • {format(new Date(result.event?.start_date), "MMM yyyy", { locale: getDateLocale() })}
                            </p>
                          </div>
                          {getPositionBadge(result.position)}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        )}
      </PortalAccessGate>
    </PortalLayout>
  );
}
