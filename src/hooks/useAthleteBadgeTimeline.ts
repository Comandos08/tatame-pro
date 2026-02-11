import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BadgeTimelineEvent {
  type: "GRANTED" | "REVOKED";
  badgeName: string;
  badgeCode: string;
  timestamp: string;
}

/**
 * Hook read-only para buscar histórico completo de badges de um atleta.
 * Gera eventos de concessão e revogação a partir de athlete_badges.
 * Apenas SELECT — sem mutations, sem side-effects.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function useAthleteBadgeTimeline(athleteId: string | undefined) {
  return useQuery<BadgeTimelineEvent[]>({
    queryKey: ["athlete-badge-timeline", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_badges")
        .select("granted_at, revoked_at, badges(name, code)")
        .eq("athlete_id", athleteId!);

      if (error) throw error;

      const events: BadgeTimelineEvent[] = [];

      for (const row of data || []) {
        const badge = (row as unknown as { badges: { name: string; code: string } | null }).badges;
        const name = badge?.name ?? "";
        const code = badge?.code ?? "";

        events.push({
          type: "GRANTED",
          badgeName: name,
          badgeCode: code,
          timestamp: row.granted_at,
        });

        if (row.revoked_at) {
          events.push({
            type: "REVOKED",
            badgeName: name,
            badgeCode: code,
            timestamp: row.revoked_at,
          });
        }
      }

      // Sort descending by timestamp
      events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

      return events;
    },
    enabled: !!athleteId,
  });
}
