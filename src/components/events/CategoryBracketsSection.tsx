/**
 * CategoryBracketsSection — P2.4 Brackets per Category
 * 
 * Shows brackets for a category with generate button.
 * Used in EventDetails categories tab.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { GenerateBracketButton } from './GenerateBracketButton';
import { BracketViewer } from './BracketViewer';
import type { EventBracket, EventStatus } from '@/types/event';
import { canGenerateBracket } from '@/types/event';

interface CategoryBracketsSectionProps {
  categoryId: string;
  categoryName: string;
  eventId: string;
  eventStatus: EventStatus;
  isAdmin?: boolean;
}

export function CategoryBracketsSection({
  categoryId,
  categoryName: _categoryName,
  eventId,
  eventStatus,
  isAdmin = false,
}: CategoryBracketsSectionProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedBracketId, setSelectedBracketId] = React.useState<string | null>(null);

  // Fetch brackets for this category
  const { data: brackets = [], refetch } = useQuery({
    queryKey: ['event-brackets', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_brackets')
        .select('*')
        .eq('category_id', categoryId)
        .is('deleted_at', null)
        .order('version', { ascending: false });
      
      if (error) throw error;
      return data as unknown as EventBracket[];
    },
    enabled: !!categoryId,
  });

  const latestBracket = brackets[0];
  
  // P2.4 SAFE MODE: Check for existing DRAFT (only 1 allowed per category)
  const draftBracket = brackets.find(b => b.status === 'DRAFT');
  const hasDraft = !!draftBracket;
  
  // Can only generate if event allows it, user is admin, AND no draft exists
  const canGenerate = canGenerateBracket(eventStatus) && isAdmin && !hasDraft;

  const handleBracketGenerated = (bracketId: string) => {
    setSelectedBracketId(bracketId);
    setIsOpen(true);
    refetch();
  };

  // If no brackets and can't generate (either no permission or draft exists), don't show
  if (brackets.length === 0 && !canGenerate && !hasDraft) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between py-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <GitBranch className="h-4 w-4" />
            {t('events.brackets.title')}
            {latestBracket && (
              <Badge variant={latestBracket.status === 'PUBLISHED' ? 'default' : 'secondary'}>
                v{latestBracket.version}
              </Badge>
            )}
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        {canGenerate && (
          <GenerateBracketButton
            categoryId={categoryId}
            eventId={eventId}
            onSuccess={handleBracketGenerated}
          />
        )}
      </div>

      <CollapsibleContent className="mt-2">
        {brackets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('events.brackets.noBrackets')}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Version selector if multiple */}
            {brackets.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {brackets.map((b) => (
                  <Button
                    key={b.id}
                    variant={selectedBracketId === b.id || (!selectedBracketId && b.id === latestBracket?.id) 
                      ? 'default' 
                      : 'outline'}
                    size="sm"
                    onClick={() => setSelectedBracketId(b.id)}
                  >
                    v{b.version}
                    {b.status === 'DRAFT' && (
                      <Badge variant="secondary" className="ml-1 text-[10px]">
                        {t('events.brackets.draft')}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            )}

            {/* Bracket viewer */}
            <BracketViewer
              bracketId={selectedBracketId || latestBracket?.id || ''}
              isAdmin={isAdmin}
            />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
