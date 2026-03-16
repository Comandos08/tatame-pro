import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EventRegistrationStatus } from '@/types/event';
import type { AsyncState } from '@/types/async';

export interface RegistrationWithEvent {
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

export interface ResultWithEvent {
  id: string;
  position: number;
  event: {
    id: string;
    name: string;
    start_date: string;
  };
  category: {
    name: string;
  };
}

interface UseAthleteEventsOptions {
  limit?: number;
}

export function useAthleteEvents(athleteId?: string, options?: UseAthleteEventsOptions) {
  const { limit } = options || {};

  const {
    data: registrations = [],
    isLoading: registrationsLoading,
  } = useQuery({
    queryKey: ['athlete-event-registrations', athleteId, limit],
    queryFn: async () => {
      if (!athleteId) return [];

      let query = supabase
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
        .order('created_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;

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
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: results = [],
    isLoading: resultsLoading,
  } = useQuery({
    queryKey: ['athlete-event-results', athleteId, limit],
    queryFn: async () => {
      if (!athleteId) return [];

      let query = supabase
        .from('event_results')
        .select(`
          id,
          position,
          event:events(id, name, start_date),
          category:event_categories(name)
        `)
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(item => ({
        ...item,
        event: Array.isArray(item.event) ? item.event[0] : item.event,
        category: Array.isArray(item.category) ? item.category[0] : item.category,
      })).filter(item => item.event) as ResultWithEvent[];
    },
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = registrationsLoading || resultsLoading;

  const asyncState: AsyncState<{ registrations: RegistrationWithEvent[]; results: ResultWithEvent[] }> =
    isLoading
      ? { state: 'LOADING', data: null, error: null }
      : registrations.length === 0 && results.length === 0
        ? { state: 'EMPTY', data: null, error: null }
        : { state: 'OK', data: { registrations, results }, error: null };

  return {
    registrations,
    results,
    isLoading,
    asyncState,
  };
}
