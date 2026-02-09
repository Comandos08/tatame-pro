import React from "react";
import { BadgeChip } from "./BadgeChip";
import { useAthleteBadges } from "@/hooks/useAthleteBadges";

interface AthleteBadgesListProps {
  athleteId: string | undefined;
  className?: string;
}

/**
 * Lista read-only de badges de um atleta.
 * Renderiza BadgeChips para cada badge ativo.
 * Não renderiza nada se não há badges.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function AthleteBadgesList({ athleteId, className }: AthleteBadgesListProps) {
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
          />
        ))}
      </div>
    </div>
  );
}
