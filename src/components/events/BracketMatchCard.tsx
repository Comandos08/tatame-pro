/**
 * BracketMatchCard — P2.4 Individual Match Display
 * 
 * Displays a single match in the bracket with athlete names and BYE indicator.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';

interface MatchData {
  id: string;
  round: number;
  position: number;
  athlete1_registration_id: string | null;
  athlete2_registration_id: string | null;
  winner_registration_id: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'BYE';
  meta: {
    note?: string;
    source?: { from: string[] };
    is_bye?: boolean;
  };
}

interface AthleteInfo {
  id: string;
  full_name: string;
}

interface BracketMatchCardProps {
  match: MatchData;
  athletes: Record<string, AthleteInfo>;
  compact?: boolean;
}

export function BracketMatchCard({ match, athletes, compact = false }: BracketMatchCardProps) {
  const { t } = useI18n();

  const athlete1 = match.athlete1_registration_id 
    ? athletes[match.athlete1_registration_id] 
    : null;
  const athlete2 = match.athlete2_registration_id 
    ? athletes[match.athlete2_registration_id] 
    : null;

  const isBye = match.status === 'BYE' || match.meta?.is_bye;
  const isFutureMatch = !athlete1 && !athlete2 && !isBye;

  const getAthleteDisplay = (athlete: AthleteInfo | null, isByeSlot: boolean) => {
    if (athlete) {
      return (
        <span className="truncate font-medium">{athlete.full_name}</span>
      );
    }
    if (isByeSlot) {
      return (
        <span className="text-muted-foreground italic">{t('events.brackets.bye')}</span>
      );
    }
    return (
      <span className="text-muted-foreground/60 italic">{t('events.brackets.tbd')}</span>
    );
  };

  return (
    <div
      className={cn(
        'border rounded-md bg-card',
        compact ? 'p-2 text-xs' : 'p-3 text-sm',
        isBye && 'border-dashed opacity-70',
        isFutureMatch && 'border-dashed'
      )}
    >
      {/* Match label */}
      <div className="text-[10px] text-muted-foreground mb-1">
        {t('events.brackets.match').replace('{match}', `${match.position}`)}
      </div>

      {/* Athlete 1 */}
      <div className={cn(
        'flex items-center gap-2 py-1 border-b',
        compact ? 'text-xs' : 'text-sm'
      )}>
        <span className="w-4 text-muted-foreground">1</span>
        {getAthleteDisplay(athlete1, isBye && !athlete2)}
      </div>

      {/* Athlete 2 */}
      <div className={cn(
        'flex items-center gap-2 py-1',
        compact ? 'text-xs' : 'text-sm'
      )}>
        <span className="w-4 text-muted-foreground">2</span>
        {getAthleteDisplay(athlete2, isBye && !athlete1)}
      </div>

      {/* Source info for future rounds */}
      {isFutureMatch && match.meta?.source && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          {match.meta.note}
        </div>
      )}
    </div>
  );
}
