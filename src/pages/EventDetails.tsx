import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Calendar,
  MapPin,
  ArrowLeft,
  Users,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  Plus,
  Trophy,
} from 'lucide-react';

import { AppShell } from '@/layouts/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EventStatusTransition } from '@/components/events/EventStatusTransition';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { Event, EventCategory, EventRegistration, EventStatus, EventRegistrationStatus, canPublishResults, EVENT_REGISTRATION_STATUS_CONFIG } from '@/types/event';

export default function EventDetails() {
  const { eventId } = useParams<{ eventId: string }>();
  const { tenant } = useTenant();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  // Query event
  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data as Event;
    },
    enabled: !!eventId,
  });

  // Query categories
  const { data: categories = [] } = useQuery({
    queryKey: ['event-categories', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_categories')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as EventCategory[];
    },
    enabled: !!eventId,
  });

  // Query registrations with athlete info
  const { data: registrations = [] } = useQuery({
    queryKey: ['event-registrations-admin', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_registrations')
        .select(`
          *,
          athlete:athletes(id, full_name, email),
          category:event_categories(id, name)
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Update event status mutation
  const updateStatus = useMutation({
    mutationFn: async (newStatus: EventStatus) => {
      if (!eventId) throw new Error('No event ID');
      const { error } = await supabase
        .from('events')
        .update({ status: newStatus, is_public: newStatus !== 'DRAFT' && newStatus !== 'ARCHIVED' })
        .eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('events.statusUpdated' as any) || 'Status atualizado!');
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: () => {
      toast.error(t('events.statusUpdateError' as any) || 'Erro ao atualizar status');
    },
  });

  // Toggle visibility
  const toggleVisibility = useMutation({
    mutationFn: async (isPublic: boolean) => {
      if (!eventId) throw new Error('No event ID');
      const { error } = await supabase
        .from('events')
        .update({ is_public: isPublic })
        .eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    },
  });

  // Update registration status
  const updateRegistration = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EventRegistrationStatus }) => {
      const { error } = await supabase
        .from('event_registrations')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('events.registrationUpdated' as any) || 'Inscrição atualizada!');
      queryClient.invalidateQueries({ queryKey: ['event-registrations-admin', eventId] });
    },
  });

  if (eventLoading) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell>
        <div className="text-center py-12">
          <p>{t('events.notFound' as any) || 'Evento não encontrado'}</p>
          <Button asChild className="mt-4">
            <Link to={`/${tenant?.slug}/app/events`}>{t('common.back')}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const startDate = new Date(event.start_date);
  const endDate = new Date(event.end_date);

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2">
              <Link to={`/${tenant?.slug}/app/events`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Link>
            </Button>
            <h1 className="text-2xl font-display font-bold">{event.name}</h1>
            {event.sport_type && (
              <Badge variant="outline" className="mt-2">{event.sport_type}</Badge>
            )}
          </div>
          <EventStatusTransition
            currentStatus={event.status as EventStatus}
            onTransition={(status) => updateStatus.mutateAsync(status)}
            disabled={updateStatus.isPending}
          />
        </div>

        {/* Event Info */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {t('events.dates' as any) || 'Datas'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">
                {format(startDate, "dd 'de' MMMM", { locale: ptBR })}
              </p>
              <p className="text-sm text-muted-foreground">
                até {format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
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
              <p className="font-medium">{event.location || 'Não definido'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('events.registrations' as any) || 'Inscrições'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{registrations.filter(r => r.status !== 'CANCELED').length}</p>
              <p className="text-sm text-muted-foreground">
                {t('events.registeredAthletes' as any) || 'atletas inscritos'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Visibility Toggle */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {event.is_public ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                <Label>{t('events.publicVisibility' as any) || 'Visibilidade Pública'}</Label>
              </div>
              <Switch
                checked={event.is_public}
                onCheckedChange={(checked) => toggleVisibility.mutate(checked)}
                disabled={event.status === 'DRAFT' || event.status === 'ARCHIVED'}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {event.is_public 
                ? t('events.visibleToPublic' as any) || 'Evento visível no portal público'
                : t('events.hiddenFromPublic' as any) || 'Evento oculto do portal público'}
            </p>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="registrations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="registrations" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('events.registrations' as any) || 'Inscrições'}
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              {t('events.categories' as any) || 'Categorias'}
            </TabsTrigger>
            {canPublishResults(event.status as EventStatus) && (
              <TabsTrigger value="results" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                {t('events.results' as any) || 'Resultados'}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="registrations">
            <Card>
              <CardHeader>
                <CardTitle>{t('events.registrationsList' as any) || 'Lista de Inscritos'}</CardTitle>
                <CardDescription>
                  {registrations.length} {t('events.registrationsTotal' as any) || 'inscrições no total'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {registrations.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    {t('events.noRegistrations' as any) || 'Nenhuma inscrição ainda'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.name')}</TableHead>
                        <TableHead>{t('events.category' as any) || 'Categoria'}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        <TableHead>{t('common.date')}</TableHead>
                        <TableHead>{t('common.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrations.map((reg: any) => {
                        const statusConfig = EVENT_REGISTRATION_STATUS_CONFIG[reg.status as keyof typeof EVENT_REGISTRATION_STATUS_CONFIG];
                        return (
                          <TableRow key={reg.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{reg.athlete?.full_name}</p>
                                <p className="text-sm text-muted-foreground">{reg.athlete?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>{reg.category?.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{statusConfig?.label || reg.status}</Badge>
                            </TableCell>
                            <TableCell>
                              {format(new Date(reg.created_at), 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell>
                              {reg.status === 'PENDING' && (
                              <Button
                                  size="sm"
                                  onClick={() => updateRegistration.mutate({ id: reg.id, status: 'CONFIRMED' as const })}
                                >
                                  {t('events.confirm' as any) || 'Confirmar'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t('events.categories' as any) || 'Categorias'}</CardTitle>
                  <CardDescription>
                    {t('events.categoriesDesc' as any) || 'Categorias disponíveis para inscrição'}
                  </CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('events.addCategory' as any) || 'Adicionar'}
                </Button>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    {t('events.noCategories' as any) || 'Nenhuma categoria criada'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.name')}</TableHead>
                        <TableHead>{t('events.price' as any) || 'Preço'}</TableHead>
                        <TableHead>{t('events.maxParticipants' as any) || 'Máx. Participantes'}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map((cat) => (
                        <TableRow key={cat.id}>
                          <TableCell className="font-medium">{cat.name}</TableCell>
                          <TableCell>
                            {cat.price_cents > 0 
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cat.currency }).format(cat.price_cents / 100)
                              : t('events.free' as any) || 'Grátis'}
                          </TableCell>
                          <TableCell>{cat.max_participants || '∞'}</TableCell>
                          <TableCell>
                            <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                              {cat.is_active ? t('status.active') : t('gradingLevels.inactive')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canPublishResults(event.status as EventStatus) && (
            <TabsContent value="results">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    {t('events.results' as any) || 'Resultados'}
                  </CardTitle>
                  <CardDescription>
                    {t('events.resultsDesc' as any) || 'Registre os resultados do evento (uma vez salvos, não podem ser alterados)'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-center py-8 text-muted-foreground">
                    {t('events.resultsFeatureComingSoon' as any) || 'Funcionalidade de resultados em desenvolvimento'}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </motion.div>
    </AppShell>
  );
}
