/**
 * 🏛️ InstitutionalErrorsCard — PI E3.1 / PI U6
 * 
 * Read-only card showing recent institutional errors grouped by code.
 * No actions, no drill-down, no graphs.
 * SAFE GOLD.
 */

import React from 'react';
import { AlertTriangle, XCircle, Info, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/contexts/I18nContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import type { Severity } from '@/lib/observability/types';

interface ErrorSummary {
  code: string;
  severity: Severity;
  count: number;
  lastOccurred: string;
}

const severityIcons: Record<string, React.ElementType> = {
  CRITICAL: XCircle,
  ERROR: AlertCircle,
  WARN: AlertTriangle,
  INFO: Info,
};

const severityColors: Record<string, string> = {
  CRITICAL: 'text-destructive',
  ERROR: 'text-destructive',
  WARN: 'text-warning',
  INFO: 'text-muted-foreground',
};

const severityBadge: Record<string, string> = {
  CRITICAL: 'bg-destructive/10 text-destructive border-destructive/20',
  ERROR: 'bg-destructive/10 text-destructive border-destructive/20',
  WARN: 'bg-warning/10 text-warning border-warning/20',
  INFO: 'bg-muted text-muted-foreground border-muted-foreground/20',
};

export function InstitutionalErrorsCard() {
  const { t } = useI18n();

  const { data: errors, isLoading } = useQuery({
    queryKey: ['institutional-errors-recent'],
    queryFn: async (): Promise<ErrorSummary[]> => {
      // Derive from audit_logs where category = 'SECURITY' or event_type contains error codes
      const { data, error } = await supabase
        .from('audit_logs')
        .select('event_type, category, created_at, metadata')
        .in('category', ['SECURITY', 'BILLING', 'AUTH'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error('[InstitutionalErrorsCard] Query error:', error.message);
        return [];
      }

      // Group by event_type and count occurrences
      const grouped = new Map<string, ErrorSummary>();
      for (const row of data || []) {
        const code = row.event_type;
        const existing = grouped.get(code);
        const severity = deriveSeverity(row.category);
        if (existing) {
          existing.count++;
        } else {
          grouped.set(code, {
            code,
            severity,
            count: 1,
            lastOccurred: row.created_at,
          });
        }
      }

      return Array.from(grouped.values())
        .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
        .slice(0, 8);
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">{t('observability.errors.title')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('observability.errors.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
          </div>
        ) : errors && errors.length > 0 ? (
          <div className="space-y-1">
            {errors.map((err) => {
              const Icon = severityIcons[err.severity] || Info;
              return (
                <div
                  key={err.code}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn('h-4 w-4', severityColors[err.severity])} />
                    <span className="text-sm font-mono">{formatEventCode(err.code)}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('text-xs', severityBadge[err.severity])}
                  >
                    {err.count}×
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Info className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('observability.errors.noErrors')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatEventCode(code: string): string {
  return code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function deriveSeverity(category: string | null): Severity {
  if (category === 'SECURITY') return 'CRITICAL';
  if (category === 'BILLING') return 'ERROR';
  if (category === 'AUTH') return 'WARN';
  return 'INFO';
}

function severityOrder(s: Severity): number {
  const order: Record<Severity, number> = { CRITICAL: 0, ERROR: 1, WARN: 2, INFO: 3 };
  return order[s] ?? 4;
}
