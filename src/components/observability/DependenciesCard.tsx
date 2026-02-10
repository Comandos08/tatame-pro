/**
 * 🏛️ DependenciesCard — PI E3.1
 * 
 * Read-only card showing dependency health status.
 * Derives from HealthSignal contract (E3).
 * No actions, no corrections.
 * SAFE GOLD.
 */

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Server } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';
import type { HealthStatus } from '@/types/observability';
import type { SystemHealth } from '@/types/observability';

interface DependenciesCardProps {
  health: SystemHealth | undefined;
  isLoading: boolean;
}

const statusIcons: Record<HealthStatus, React.ElementType> = {
  OK: CheckCircle,
  DEGRADED: AlertTriangle,
  CRITICAL: XCircle,
  UNKNOWN: Server,
};

const statusColors: Record<HealthStatus, string> = {
  OK: 'text-success',
  DEGRADED: 'text-warning',
  CRITICAL: 'text-destructive',
  UNKNOWN: 'text-muted-foreground',
};

export function DependenciesCard({ health, isLoading }: DependenciesCardProps) {
  const { t } = useI18n();

  const dependencies = React.useMemo(() => {
    if (!health?.checks) return [];
    return health.checks.map(check => ({
      name: check.name,
      status: check.status,
      reason: check.reason,
    }));
  }, [health]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{t('observability.dependencies.title')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('observability.dependencies.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
          </div>
        ) : dependencies.length > 0 ? (
          <div className="space-y-1">
            {dependencies.map((dep) => {
              const Icon = statusIcons[dep.status];
              return (
                <div
                  key={dep.name}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn('h-4 w-4', statusColors[dep.status])} />
                    <span className="text-sm font-medium">{dep.name}</span>
                  </div>
                  {dep.reason && (
                    <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {dep.reason}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Server className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('observability.dependencies.noData')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
