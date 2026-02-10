import React from "react";
import { BadgeChip } from "./BadgeChip";
import { useAthleteBadges } from "@/hooks/useAthleteBadges";
import type { BadgeSurface } from "@/types/badge";

interface AthleteBadgesListProps {
  athleteId: string | undefined;
  surface: BadgeSurface;
  className?: string;
}

/**
 * Lista read-only de badges de um atleta.
 * Renderiza BadgeChips para cada badge ativo.
 * D2: Requer surface explícita, propagada aos chips.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function AthleteBadgesList({ athleteId, surface, className }: AthleteBadgesListProps) {
  const { data: badges } = useAthleteBadges(athleteId);

  if (!badges || badges.length === 0) return null;

  return (
    <div className={className} data-testid="athlete-badges-list">
      <div className="flex flex-wrap gap-1.5">
        {badges.map((badge) => (
          <BadgeChip
            key={badge.code}
            name={badge.name}
            description={badge.description}
            surface={surface}
          />
        ))}
      </div>
    </div>
  );
}
