/**
 * PublicEventBrackets — P2.1
 *
 * Public (unauthenticated) page that shows published brackets for an event.
 * Reuses BracketViewer with isAdmin=false (publish button hidden).
 *
 * Route: /:tenantSlug/events/:eventId/brackets
 */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, GitBranch, Trophy } from 'lucide-react';

import PublicHeader from '@/components/PublicHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BracketViewer } from '@/components/events/BracketViewer';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';

export default function PublicEventBrackets() {
  const { eventId } = useParams<{ eventId: string }>();
  const { tenant } = useTenant();
  const { t } = useI18n();

  // Fetch event name for the header
  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['public-event-brackets-header', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('events')
        .select('id, name, status')
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Fetch published brackets for this event
  const { data: brackets = [], isLoading: bracketsLoading } = useQuery({
    queryKey: ['public-event-brackets', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_brackets')
        .select('id, category_id, version, status, event_categories(name)')
        .eq('event_id', eventId)
        .eq('status', 'PUBLISHED')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Array<{
        id: string;
        category_id: string;
        version: number;
        status: string;
        event_categories: { name: string } | null;
      }>;
    },
    enabled: !!eventId,
  });

  const isLoading = eventLoading || bracketsLoading;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />

      <main className="container mx-auto px-4 py-8 max-w-5xl flex-1">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Back link */}
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/${tenant?.slug}/events/${eventId}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('events.backToEvent') || 'Voltar para o evento'}
              </Link>
            </Button>

            {/* Page header */}
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <GitBranch className="h-6 w-6 text-primary" />
                {t('events.brackets') || 'Chaves'}
              </h1>
              {event && (
                <p className="text-muted-foreground mt-1">{event.name}</p>
              )}
            </div>

            {/* Brackets list */}
            {brackets.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Trophy className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <h3 className="font-medium text-lg mb-1">
                    {t('events.noBracketsPublished') || 'Chaves ainda não divulgadas'}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {t('events.noBracketsPublishedDesc') || 'As chaves serão disponibilizadas assim que a organização publicá-las.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8">
                {brackets.map((bracket) => (
                  <div key={bracket.id}>
                    {bracket.event_categories?.name && (
                      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" />
                        {bracket.event_categories.name}
                      </h2>
                    )}
                    <BracketViewer bracketId={bracket.id} isAdmin={false} />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>

      <footer className="py-8 border-t border-border mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Powered by <span className="font-semibold">TATAME Pro</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
