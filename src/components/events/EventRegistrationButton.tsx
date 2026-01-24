import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { EventCategory, EventRegistration, canRegisterForEvent, canCancelRegistration, EventStatus } from '@/types/event';

interface EventRegistrationButtonProps {
  eventId: string;
  eventStatus: EventStatus;
  tenantId: string;
  categories: EventCategory[];
}

export function EventRegistrationButton({
  eventId,
  eventStatus,
  tenantId,
  categories,
}: EventRegistrationButtonProps) {
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Get athlete ID for current user
  const { data: athlete } = useQuery({
    queryKey: ['athlete-for-registration', currentUser?.id, tenantId],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const { data, error } = await supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', currentUser.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentUser?.id && !!tenantId,
  });

  // Get existing registrations for this event
  const { data: existingRegistrations = [] } = useQuery({
    queryKey: ['event-registrations', eventId, athlete?.id],
    queryFn: async () => {
      if (!athlete?.id) return [];
      const { data, error } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', eventId)
        .eq('athlete_id', athlete.id);
      if (error) throw error;
      return data as EventRegistration[];
    },
    enabled: !!athlete?.id,
  });

  const activeRegistration = existingRegistrations.find(r => r.status !== 'CANCELED');

  const registerMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      if (!athlete?.id || !currentUser?.id) throw new Error('Athlete not found');
      
      const { error } = await supabase.from('event_registrations').insert({
        event_id: eventId,
        category_id: categoryId,
        athlete_id: athlete.id,
        tenant_id: tenantId,
        registered_by: currentUser.id,
        status: 'PENDING',
        payment_status: 'NOT_PAID',
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('events.registrationSuccess' as any) || 'Inscrição realizada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      setSelectedCategory('');
    },
    onError: (error: any) => {
      console.error('Registration error:', error);
      if (error.message?.includes('unique constraint')) {
        toast.error(t('events.alreadyRegistered' as any) || 'Você já está inscrito nesta categoria');
      } else {
        toast.error(t('events.registrationError' as any) || 'Erro ao realizar inscrição');
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!activeRegistration) throw new Error('No registration to cancel');
      
      const { error } = await supabase
        .from('event_registrations')
        .update({ status: 'CANCELED' })
        .eq('id', activeRegistration.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('events.cancellationSuccess' as any) || 'Inscrição cancelada');
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      setShowCancelDialog(false);
    },
    onError: (error) => {
      console.error('Cancellation error:', error);
      toast.error(t('events.cancellationError' as any) || 'Erro ao cancelar inscrição');
    },
  });

  // Not logged in or no athlete profile
  if (!currentUser || !athlete) {
    return (
      <Button disabled variant="outline">
        {t('events.loginToRegister' as any) || 'Faça login para se inscrever'}
      </Button>
    );
  }

  // Already registered
  if (activeRegistration) {
    const canCancel = canCancelRegistration(eventStatus);
    const registeredCategory = categories.find(c => c.id === activeRegistration.category_id);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          <span>
            {t('events.registeredIn' as any) || 'Inscrito em'}: {registeredCategory?.name || 'Categoria'}
          </span>
        </div>
        
        {canCancel && (
          <>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => setShowCancelDialog(true)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              {t('events.cancelRegistration' as any) || 'Cancelar Inscrição'}
            </Button>

            <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('events.confirmCancellation' as any) || 'Confirmar Cancelamento'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('events.cancellationWarning' as any) || 
                      'Tem certeza que deseja cancelar sua inscrição? Esta ação não pode ser desfeita.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cancelMutation.mutate()}>
                    {t('events.confirmCancel' as any) || 'Sim, cancelar'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    );
  }

  // Registration not open
  if (!canRegisterForEvent(eventStatus)) {
    return (
      <Button disabled variant="outline">
        {t('events.registrationsClosed' as any) || 'Inscrições encerradas'}
      </Button>
    );
  }

  // No categories available
  if (categories.length === 0) {
    return (
      <Button disabled variant="outline">
        {t('events.noCategoriesAvailable' as any) || 'Nenhuma categoria disponível'}
      </Button>
    );
  }

  const activeCategories = categories.filter(c => c.is_active);

  return (
    <div className="space-y-3">
      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
        <SelectTrigger>
          <SelectValue placeholder={t('events.selectCategory' as any) || 'Selecione uma categoria'} />
        </SelectTrigger>
        <SelectContent>
          {activeCategories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
              {category.price_cents > 0 && (
                <span className="ml-2 text-muted-foreground">
                  ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: category.currency }).format(category.price_cents / 100)})
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        className="w-full"
        disabled={!selectedCategory || registerMutation.isPending}
        onClick={() => registerMutation.mutate(selectedCategory)}
      >
        {registerMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {t('events.register' as any) || 'Inscrever-se'}
      </Button>
    </div>
  );
}
