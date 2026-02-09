import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeAsyncState } from '@/lib/async/normalizeAsyncState';
import type { AsyncState } from '@/types/async';

/**
 * Hook to fetch athlete photo from storage.
 * Uses getPublicUrl directly (no list) for better performance.
 * Returns null silently if photo doesn't exist.
 * 
 * Path expected: athletes/{athlete_id}/photo.jpg
 * 
 * NOTE: This PI only implements READ. Athlete photo upload will be in a future PI.
 */
export function useAthletePhoto(athleteId: string | undefined) {
  const query = useQuery({
    queryKey: ['athlete-photo', athleteId],
    queryFn: async () => {
      if (!athleteId) return null;

      // Generate public URL directly (no list call)
      const { data } = supabase.storage
        .from('athletes')
        .getPublicUrl(`${athleteId}/photo.jpg`);

      if (!data?.publicUrl) return null;

      // Verify if image exists via HEAD request
      try {
        const response = await fetch(data.publicUrl, { method: 'HEAD' });
        return response.ok ? data.publicUrl : null;
      } catch {
        // Silent error - returns null if doesn't exist
        return null;
      }
    },
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry if fails
  });

  const asyncState: AsyncState<string> = normalizeAsyncState(query);

  return { ...query, asyncState };
}
