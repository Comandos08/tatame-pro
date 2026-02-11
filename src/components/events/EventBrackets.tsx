/**
 * E1.0 — EVENT BRACKETS COMPONENT (SAFE GOLD)
 *
 * Manage and display event brackets.
 * SAFE GOLD: deterministic, explicit actions only.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  GitBranch, 
  RefreshCw, 
  Upload, 
  Lock, 
  Loader2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { EventBracketEntity, EventCategoryEntity } from '@/domain/events/types';
import type { SafeEventStatus, SafeBracketStatus } from '@/domain/events/safeEnums';
import { 
  canGenerateBrackets, 
  canRegenerateBracket, 
  canPublishBracket, 
  isBracketLocked 
} from '@/domain/events/guards';
import { normalizeBracketStatus } from '@/domain/events/safeEnums';
import { BracketViewer } from './BracketViewer';

interface EventBracketsProps {
  eventId: string;
  eventStatus: SafeEventStatus;
  categories: EventCategoryEntity[];
  brackets: EventBracketEntity[];
  onGenerateBracket: (categoryId: string) => Promise<void>;
  onRegenerateBracket: (bracketId: string) => Promise<void>;
  onPublishBracket: (bracketId: string) => Promise<void>;
  isGenerating?: boolean;
  isPublishing?: boolean;
}

export function EventBrackets({
  eventId: _eventId,
  eventStatus,
  categories,
  brackets,
  onGenerateBracket,
  onRegenerateBracket,
  onPublishBracket,
  isGenerating = false,
  isPublishing = false,
}: EventBracketsProps) {
  const { t } = useI18n();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null
  );
  const [confirmAction, setConfirmAction] = useState<{
    type: 'generate' | 'regenerate' | 'publish';
    targetId: string;
  } | null>(null);

  const canGenerate = canGenerateBrackets(eventStatus);

  const getBracketForCategory = useCallback(
    (categoryId: string): EventBracketEntity | undefined => {
      return brackets.find((b) => b.categoryId === categoryId);
    },
    [brackets]
  );

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;

    switch (confirmAction.type) {
      case 'generate':
        await onGenerateBracket(confirmAction.targetId);
        break;
      case 'regenerate':
        await onRegenerateBracket(confirmAction.targetId);
        break;
      case 'publish':
        await onPublishBracket(confirmAction.targetId);
        break;
    }

    setConfirmAction(null);
  }, [confirmAction, onGenerateBracket, onRegenerateBracket, onPublishBracket]);

  const renderBracketStatus = (status: SafeBracketStatus) => {
    const variants: Record<SafeBracketStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      DRAFT: 'secondary',
      GENERATED: 'outline',
      PUBLISHED: 'default',
      LOCKED: 'destructive',
    };

    const labels: Record<SafeBracketStatus, string> = {
      DRAFT: t('events.brackets.statusDraft'),
      GENERATED: t('events.brackets.statusGenerated'),
      PUBLISHED: t('events.brackets.statusPublished'),
      LOCKED: t('events.brackets.statusLocked'),
    };

    return (
      <Badge variant={variants[status]}>
        {status === 'LOCKED' && <Lock className="h-3 w-3 mr-1" />}
        {status === 'PUBLISHED' && <CheckCircle className="h-3 w-3 mr-1" />}
        {labels[status]}
      </Badge>
    );
  };

  const renderCategoryActions = (category: EventCategoryEntity) => {
    const bracket = getBracketForCategory(category.id);
    const bracketStatus = bracket ? normalizeBracketStatus(bracket.status) : null;

    if (!canGenerate) {
      return (
        <p className="text-sm text-muted-foreground">
          {t('events.brackets.cannotGenerate')}
        </p>
      );
    }

    if (!bracket) {
      return (
        <Button
          onClick={() => setConfirmAction({ type: 'generate', targetId: category.id })}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <GitBranch className="h-4 w-4 mr-2" />
          )}
          {t('events.brackets.generate')}
        </Button>
      );
    }

    const isLocked = isBracketLocked(bracketStatus!);

    return (
      <div className="flex items-center gap-3">
        {renderBracketStatus(bracketStatus!)}

        {canRegenerateBracket(bracketStatus!) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction({ type: 'regenerate', targetId: bracket.id })}
            disabled={isGenerating}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('events.brackets.regenerate')}
          </Button>
        )}

        {canPublishBracket(bracketStatus!) && (
          <Button
            size="sm"
            onClick={() => setConfirmAction({ type: 'publish', targetId: bracket.id })}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {t('events.brackets.publish')}
          </Button>
        )}

        {isLocked && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" />
            {t('events.brackets.immutable')}
          </span>
        )}
      </div>
    );
  };

  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">
            {t('events.brackets.noCategories')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {t('events.brackets.title')}
          </CardTitle>
          <CardDescription>
            {t('events.brackets.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={selectedCategoryId ?? ""}
            onValueChange={setSelectedCategoryId}
          >
            <TabsList className="mb-4 flex-wrap h-auto">
              {categories.map((category) => {
                const bracket = getBracketForCategory(category.id);
                const hasPublished = bracket?.status === 'PUBLISHED' || bracket?.status === 'LOCKED';

                return (
                  <TabsTrigger
                    key={category.id}
                    value={category.id}
                    className="relative"
                  >
                    {category.name}
                    {hasPublished && (
                      <CheckCircle className="h-3 w-3 ml-1 text-primary" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {categories.map((category) => {
              const bracket = getBracketForCategory(category.id);

              return (
                <TabsContent key={category.id} value={category.id}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{category.name}</h4>
                        {category.description && (
                          <p className="text-sm text-muted-foreground">
                            {category.description}
                          </p>
                        )}
                      </div>
                      {renderCategoryActions(category)}
                    </div>

                    {bracket && (
                      <div className="border rounded-lg p-4">
                        <BracketViewer
                          bracketId={bracket.id}
                          isAdmin={true}
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {confirmAction?.type === 'generate' &&
                t('events.brackets.confirmGenerate')}
              {confirmAction?.type === 'regenerate' &&
                t('events.brackets.confirmRegenerate')}
              {confirmAction?.type === 'publish' &&
                t('events.brackets.confirmPublish')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'generate' &&
                t('events.brackets.confirmGenerateDesc')}
              {confirmAction?.type === 'regenerate' &&
                t('events.brackets.confirmRegenerateDesc')}
              {confirmAction?.type === 'publish' &&
                t('events.brackets.confirmPublishDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
