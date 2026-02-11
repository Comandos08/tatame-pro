/**
 * GenerateBracketButton — P2.4 Bracket Generation UI
 * 
 * Button with confirmation dialog to generate a bracket for a category.
 * Calls generate-event-bracket edge function.
 */

import { useState } from 'react';
import { logger } from '@/lib/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

interface GenerateBracketButtonProps {
  categoryId: string;
  eventId: string;
  disabled?: boolean;
  onSuccess?: (bracketId: string, version: number) => void;
}

export function GenerateBracketButton({
  categoryId,
  eventId,
  disabled = false,
  onSuccess,
}: GenerateBracketButtonProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { session: impersonationSession } = useImpersonation();
  const [open, setOpen] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      logger.log('[GenerateBracketButton] Generating bracket:', { categoryId, eventId });

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-event-bracket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            ...(impersonationSession?.impersonationId ? { 'x-impersonation-id': impersonationSession.impersonationId } : {}),
          },
          body: JSON.stringify({
            categoryId,
            eventId,
            impersonationId: impersonationSession?.impersonationId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        logger.error('[GenerateBracketButton] Error:', result);
        throw new Error(result.error || 'Failed to generate bracket');
      }

      logger.log('[GenerateBracketButton] Success:', result);
      return result;
    },
    onSuccess: (data) => {
      toast.success(t('events.brackets.generated'));
      queryClient.invalidateQueries({ queryKey: ['event-brackets', categoryId] });
      queryClient.invalidateQueries({ queryKey: ['event-brackets-list', eventId] });
      setOpen(false);
      onSuccess?.(data.bracketId, data.version);
    },
    onError: (error: Error) => {
      logger.error('[GenerateBracketButton] Mutation error:', error);
      toast.error(error.message || t('events.brackets.generationError'));
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <GitBranch className="h-4 w-4 mr-2" />
          )}
          {generateMutation.isPending 
            ? t('events.brackets.generating') 
            : t('events.brackets.generate')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('events.brackets.confirmGenerate')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('events.brackets.snapshotWarning')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              generateMutation.mutate();
            }}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {t('events.brackets.generate')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
