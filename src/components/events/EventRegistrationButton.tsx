import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, Loader2, UserPlus } from 'lucide-react';

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
  tenantSlug?: string;
}

export function EventRegistrationButton({
  eventId,
  eventStatus,
  tenantId,
  categories,
  tenantSlug,
}: EventRegistrationButtonProps) {
  const { currentUser, isLoading: isAuthLoading, isAuthenticated } = useCurrentUser();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { tenantSlug: urlTenantSlug } = useParams<{ tenantSlug: string }>();
  
  const resolvedTenantSlug = tenantSlug || urlTenantSlug || '';
  
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Get athlete ID for current user (only runs if authenticated)
  const { data: athlete, isLoading: isAthleteLoading } = useQuery({
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
    enabled: !!currentUser?.id && !!tenantId && isAuthenticated,
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
      toast.success(t('events.registrationSuccess'));
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      setSelectedCategory('');
    },
    onError: (error: any) => {
      console.error('Registration error:', error);
      if (error.message?.includes('unique constraint')) {
        toast.error(t('events.alreadyRegistered'));
      } else {
        toast.error(t('events.registrationError'));
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
      toast.success(t('events.cancellationSuccess'));
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      setShowCancelDialog(false);
    },
    onError: (error) => {
      console.error('Cancellation error:', error);
      toast.error(t('events.cancellationError'));
    },
  });

  // === STATE HIERARCHY (in priority order) ===
  
  // State 1: Auth loading
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // State 2: Not authenticated
  if (!isAuthenticated) {
    return (
      <Button asChild variant="default" className="w-full">
        <Link to={`/${resolvedTenantSlug}/login?next=/${resolvedTenantSlug}/events/${eventId}`}>
          {t('events.loginToRegister')}
        </Link>
      </Button>
    );
  }

  // State 3: Athlete loading
  if (isAthleteLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // State 4: Logged in but no athlete profile in this tenant
  if (!athlete) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          {t('events.completeMembershipToRegister')}
        </p>
        <Button asChild variant="default" className="w-full">
          <Link to={`/${resolvedTenantSlug}/membership/new`}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t('events.startMembership')}
          </Link>
        </Button>
      </div>
    );
  }

  // State 5: Event cancelled - read-only
  if (eventStatus === 'CANCELLED') {
    return (
      <Button disabled variant="outline" className="w-full text-destructive border-destructive/50">
        {t('events.eventCancelled')}
      </Button>
    );
  }

  // Already registered
  if (activeRegistration) {
    const canCancel = canCancelRegistration(eventStatus);
    const registeredCategory = categories.find(c => c.id === activeRegistration.category_id);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" />
          <span>
            {t('events.registeredIn')}: {registeredCategory?.name || t('events.category')}
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
              {t('events.cancelRegistration')}
            </Button>

            <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('events.confirmCancellation')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('events.cancellationWarning')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cancelMutation.mutate()}>
                    {t('events.confirmCancel')}
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
        {t('events.registrationsClosed')}
      </Button>
    );
  }

  // No categories available
  if (categories.length === 0) {
    return (
      <Button disabled variant="outline">
        {t('events.noCategoriesAvailable')}
      </Button>
    );
  }

  const activeCategories = categories.filter(c => c.is_active);

  return (
    <div className="space-y-3">
      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
        <SelectTrigger>
          <SelectValue placeholder={t('events.selectCategory')} />
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
        variant="tenant"
        disabled={!selectedCategory || registerMutation.isPending}
        onClick={() => registerMutation.mutate(selectedCategory)}
      >
        {registerMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {t('events.register')}
      </Button>
    </div>
  );
}
