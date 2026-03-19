import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAsyncState } from "@/lib/async/normalizeAsyncState";
import type { AsyncState } from "@/types/async";

interface AthleteBadgeDisplay {
  code: string;
  name: string;
  description: string | null;
}

/**
 * Hook read-only para buscar badges ativos de um atleta.
 * Apenas SELECT — sem mutations, sem side-effects.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function useAthleteBadges(athleteId: string | undefined) {
  const query = useQuery<AthleteBadgeDisplay[]>({
    queryKey: ["athlete-badges", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_badges")
        .select("badges(code, name, description)")
        .eq("athlete_id", athleteId!)
        .is("revoked_at", null);

      if (error) throw error;

      type BadgeRow = { badges: { code: string; name: string; description: string | null } | null };
      return (data as BadgeRow[] || []).map((row) => ({
        code: row.badges?.code ?? "",
        name: row.badges?.name ?? "",
        description: row.badges?.description ?? null,
      }));
    },
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000,
  });

  const asyncState: AsyncState<AthleteBadgeDisplay[]> = normalizeAsyncState(query);

  return { ...query, asyncState };
}
