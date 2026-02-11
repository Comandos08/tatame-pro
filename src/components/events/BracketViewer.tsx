/**
 * BracketViewer — P2.4 Bracket Visualization
 * 
 * Displays a bracket with rounds and matches in a grid layout.
 * Shows version, status, and criterion info.
 * Includes publish button for DRAFT brackets (admin only).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, GitBranch } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { formatDateTime } from '@/lib/i18n/formatters';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { BracketMatchCard } from './BracketMatchCard';
import type { EventBracket, EventBracketMatch, BracketMeta } from '@/types/event';

interface BracketViewerProps {
  bracketId: string;
  isAdmin?: boolean;
}

export function BracketViewer({ bracketId, isAdmin = false }: BracketViewerProps) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { session: impersonationSession } = useImpersonation();

  // Fetch bracket
  const { data: bracket, isLoading: bracketLoading } = useQuery({
    queryKey: ['event-bracket', bracketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_brackets')
        .select('*')
        .eq('id', bracketId)
        .single();
      
      if (error) throw error;
      return data as unknown as EventBracket;
    },
    enabled: !!bracketId,
  });

  // Fetch matches
  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ['event-bracket-matches', bracketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_bracket_matches')
        .select('*')
        .eq('bracket_id', bracketId)
        .order('round', { ascending: true })
        .order('position', { ascending: true });
      
      if (error) throw error;
      return data as unknown as EventBracketMatch[];
    },
    enabled: !!bracketId,
  });

  // Fetch athlete info for matches
  const registrationIds = matches
    .flatMap(m => [m.athlete1_registration_id, m.athlete2_registration_id])
    .filter((id): id is string => !!id);

  const { data: athletes = {} } = useQuery({
    queryKey: ['bracket-athletes', registrationIds],
    queryFn: async () => {
      if (registrationIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from('event_registrations')
        .select('id, athlete:athletes(id, full_name)')
        .in('id', registrationIds);
      
      if (error) throw error;
      
      const map: Record<string, { id: string; full_name: string }> = {};
      for (const reg of data || []) {
        if (reg.athlete) {
          const athlete = reg.athlete as unknown as { id: string; full_name: string };
          map[reg.id] = {
            id: athlete.id,
            full_name: athlete.full_name,
          };
        }
      }
      return map;
    },
    enabled: registrationIds.length > 0,
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-event-bracket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            ...(impersonationSession?.impersonationId ? { 'x-impersonation-id': impersonationSession.impersonationId } : {}),
          },
          body: JSON.stringify({
            bracketId,
            impersonationId: impersonationSession?.impersonationId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to publish bracket');
      }

      return result;
    },
    onSuccess: () => {
      toast.success(t('events.brackets.published'));
      queryClient.invalidateQueries({ queryKey: ['event-bracket', bracketId] });
      queryClient.invalidateQueries({ queryKey: ['event-brackets'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('events.brackets.publishError'));
    },
  });

  if (bracketLoading || matchesLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!bracket) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('events.brackets.noBrackets')}
        </CardContent>
      </Card>
    );
  }

  // Group matches by round
  const matchesByRound = matches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, EventBracketMatch[]>);

  const rounds = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
  const meta = bracket.meta as BracketMeta;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="flex items-center gap-2">
                {bracket.status === 'PUBLISHED' 
                  ? t('events.brackets.official')
                  : t('events.brackets.draft')}
                <Badge variant={bracket.status === 'PUBLISHED' ? 'default' : 'secondary'}>
                  {t('events.brackets.version').replace('{version}', String(bracket.version))}
                </Badge>
              </CardTitle>
              <CardDescription>
                {t('events.brackets.generatedAt').replace(
                  '{date}',
                  formatDateTime(bracket.generated_at, locale)
                )}
                {' • '}
                {t('events.brackets.criterion')}
              </CardDescription>
            </div>
          </div>

          {/* Publish button for DRAFT */}
          {isAdmin && bracket.status === 'DRAFT' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={publishMutation.isPending}>
                  {publishMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  {t('events.brackets.publish')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('events.brackets.confirmPublish')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('events.brackets.publishWarning')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      publishMutation.mutate();
                    }}
                    disabled={publishMutation.isPending}
                  >
                    {t('events.brackets.publish')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Meta info */}
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span>{meta.registrations_count} {t('events.registeredAthletes')}</span>
          <span>{meta.byes_count} BYEs</span>
          <span>{rounds.length} {t('events.brackets.round').replace('{round}', 's')}</span>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="w-full">
          <div className="flex gap-6 pb-4" style={{ minWidth: `${rounds.length * 200}px` }}>
            {rounds.map((round) => (
              <div key={round} className="flex-shrink-0 w-48">
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">
                  {t('events.brackets.round').replace('{round}', String(round))}
                </h4>
                <div className="space-y-3">
                  {matchesByRound[round].map((match) => (
                    <BracketMatchCard
                      key={match.id}
                      match={match}
                      athletes={athletes}
                      compact
                      isAdmin={isAdmin}
                      bracketStatus={bracket.status as 'DRAFT' | 'PUBLISHED'}
                      onResultRecorded={() => {
                        queryClient.invalidateQueries({ queryKey: ['event-bracket-matches', bracketId] });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
