import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Plus, Filter, Search } from 'lucide-react';
import { toast } from 'sonner';

import { AppShell } from '@/layouts/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EventCard } from '@/components/events/EventCard';
import { CreateEventDialog } from '@/components/events/CreateEventDialog';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { Event, EventStatus, EVENT_STATUS_CONFIG } from '@/types/event';

export default function EventsList() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<EventStatus | 'ALL'>('ALL');

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ['events', tenant?.id, statusFilter],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      let query = supabase
        .from('events')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('start_date', { ascending: false });
      
      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Event[];
    },
    enabled: !!tenant?.id,
  });

  // Get registration counts for each event
  const { data: registrationCounts = {} } = useQuery({
    queryKey: ['event-registration-counts', events.map(e => e.id)],
    queryFn: async () => {
      if (events.length === 0) return {};
      
      const { data, error } = await supabase
        .from('event_registrations')
        .select('event_id')
        .in('event_id', events.map(e => e.id))
        .neq('status', 'CANCELED');
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(reg => {
        counts[reg.event_id] = (counts[reg.event_id] || 0) + 1;
      });
      return counts;
    },
    enabled: events.length > 0,
  });

  if (error) {
    toast.error(t('error.loadingFailed'));
  }

  const filteredEvents = events.filter(event =>
    event.name.toLowerCase().includes(search.toLowerCase()) ||
    event.location?.toLowerCase().includes(search.toLowerCase())
  );

  const statusOptions: (EventStatus | 'ALL')[] = ['ALL', ...Object.keys(EVENT_STATUS_CONFIG) as EventStatus[]];

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              {t('events.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('events.titleDesc')}
            </p>
          </div>
          <CreateEventDialog />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('events.searchEvents')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select 
                value={statusFilter} 
                onValueChange={(v) => setStatusFilter(v as EventStatus | 'ALL')}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder={t('common.filter')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('events.allStatuses')}</SelectItem>
                  {Object.entries(EVENT_STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Events Grid */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <Card data-testid="events-empty-state">
            <CardContent className="py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">
                {t('events.noEvents')}
              </h3>
              <p className="text-muted-foreground mt-2">
                {t('events.noEventsDesc')}
              </p>
              <CreateEventDialog>
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('events.createEvent')}
                </Button>
              </CreateEventDialog>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="events-list">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                tenantSlug={tenant?.slug || ''}
                isAdmin={true}
                registrationCount={registrationCounts[event.id] || 0}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AppShell>
  );
}
