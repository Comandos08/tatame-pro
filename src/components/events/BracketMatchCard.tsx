/**
 * BracketMatchCard — P2.4/P2.5 Individual Match Display with Result Recording
 * 
 * Displays a single match in the bracket with athlete names and BYE indicator.
 * Allows admins to record results on PUBLISHED brackets.
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trophy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/contexts/I18nContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { BracketStatus, MatchMeta } from '@/types/event';

interface MatchData {
  id: string;
  round: number;
  position: number;
  athlete1_registration_id: string | null;
  athlete2_registration_id: string | null;
  winner_registration_id: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'BYE';
  meta: MatchMeta;
}

interface AthleteInfo {
  id: string;
  full_name: string;
}

interface BracketMatchCardProps {
  match: MatchData;
  athletes: Record<string, AthleteInfo>;
  compact?: boolean;
  isAdmin?: boolean;
  bracketStatus?: BracketStatus;
  onResultRecorded?: () => void;
}

export function BracketMatchCard({ 
  match, 
  athletes, 
  compact = false,
  isAdmin = false,
  bracketStatus = 'DRAFT',
  onResultRecorded,
}: BracketMatchCardProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { session: impersonationSession } = useImpersonation();
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const athlete1 = match.athlete1_registration_id 
    ? athletes[match.athlete1_registration_id] 
    : null;
  const athlete2 = match.athlete2_registration_id 
    ? athletes[match.athlete2_registration_id] 
    : null;

  const isBye = match.status === 'BYE' || match.meta?.is_bye;
  const isCompleted = match.status === 'COMPLETED';
  const isFutureMatch = !athlete1 && !athlete2 && !isBye;

  // Can record result: admin + PUBLISHED + SCHEDULED + both athletes defined
  const canRecord = 
    isAdmin && 
    bracketStatus === 'PUBLISHED' &&
    match.status === 'SCHEDULED' &&
    !!athlete1 && !!athlete2;

  // Record result mutation
  const recordMutation = useMutation({
    mutationFn: async (winnerRegistrationId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-match-result`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            ...(impersonationSession?.impersonationId ? { 'x-impersonation-id': impersonationSession.impersonationId } : {}),
          },
          body: JSON.stringify({
            matchId: match.id,
            winnerRegistrationId,
            impersonationId: impersonationSession?.impersonationId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to record result');
      }

      return result;
    },
    onSuccess: () => {
      toast.success(t('events.brackets.resultRecorded'));
      setDialogOpen(false);
      setSelectedWinner(null);
      onResultRecorded?.();
      queryClient.invalidateQueries({ queryKey: ['event-bracket-matches'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('events.brackets.resultError'));
    },
  });

  const handleConfirmResult = () => {
    if (selectedWinner) {
      recordMutation.mutate(selectedWinner);
    }
  };

  const isWinner = (registrationId: string | null) => 
    isCompleted && match.winner_registration_id === registrationId;

  const getAthleteDisplay = (athlete: AthleteInfo | null, registrationId: string | null, isByeSlot: boolean) => {
    if (athlete) {
      return (
        <span className={cn(
          "truncate",
          isWinner(registrationId) && "font-bold"
        )}>
          {athlete.full_name}
          {isWinner(registrationId) && (
            <Trophy className="inline-block ml-1 h-3 w-3 text-primary" />
          )}
        </span>
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
        isFutureMatch && 'border-dashed',
        isCompleted && 'bg-muted/30'
      )}
    >
      {/* Match label */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">
          {t('events.brackets.match', { match: String(match.position) })}
        </span>
        {isCompleted && (
          <span className="text-[10px] text-primary flex items-center gap-0.5">
            <Check className="h-3 w-3" />
            {t('events.brackets.completed')}
          </span>
        )}
      </div>

      {/* Athlete 1 */}
      <div className={cn(
        'flex items-center gap-2 py-1 border-b',
        compact ? 'text-xs' : 'text-sm',
        isWinner(match.athlete1_registration_id) && 'bg-primary/10 rounded px-1'
      )}>
        <span className="w-4 text-muted-foreground">1</span>
        {getAthleteDisplay(athlete1, match.athlete1_registration_id, isBye && !athlete2)}
      </div>

      {/* Athlete 2 */}
      <div className={cn(
        'flex items-center gap-2 py-1',
        compact ? 'text-xs' : 'text-sm',
        isWinner(match.athlete2_registration_id) && 'bg-primary/10 rounded px-1'
      )}>
        <span className="w-4 text-muted-foreground">2</span>
        {getAthleteDisplay(athlete2, match.athlete2_registration_id, isBye && !athlete1)}
      </div>

      {/* Source info for future rounds */}
      {isFutureMatch && match.meta?.source && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          {match.meta.note}
        </div>
      )}

      {/* Record Result Button */}
      {canRecord && (
        <div className="mt-2">
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full text-xs h-7"
                disabled={recordMutation.isPending}
              >
                {recordMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Trophy className="h-3 w-3 mr-1" />
                )}
                {t('events.brackets.recordResult')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('events.brackets.selectWinner')}</AlertDialogTitle>
                <AlertDialogDescription className="text-destructive">
                  {t('events.brackets.resultWarning')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              
              <RadioGroup
                value={selectedWinner || ''}
                onValueChange={setSelectedWinner}
                className="gap-3 my-4"
              >
                <div className="flex items-center space-x-3 border rounded-md p-3 hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem 
                    value={match.athlete1_registration_id || ''} 
                    id="athlete1"
                    disabled={!match.athlete1_registration_id}
                  />
                  <Label htmlFor="athlete1" className="flex-1 cursor-pointer">
                    {athlete1?.full_name || t('events.brackets.tbd')}
                  </Label>
                </div>
                <div className="flex items-center space-x-3 border rounded-md p-3 hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem 
                    value={match.athlete2_registration_id || ''} 
                    id="athlete2"
                    disabled={!match.athlete2_registration_id}
                  />
                  <Label htmlFor="athlete2" className="flex-1 cursor-pointer">
                    {athlete2?.full_name || t('events.brackets.tbd')}
                  </Label>
                </div>
              </RadioGroup>

              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setSelectedWinner(null)}>
                  {t('common.cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmResult();
                  }}
                  disabled={!selectedWinner || recordMutation.isPending}
                >
                  {recordMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trophy className="h-4 w-4 mr-2" />
                  )}
                  {t('events.brackets.confirmResult')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
