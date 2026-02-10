import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, subHours } from 'date-fns';

interface JobMetrics {
  lastExpireRun: string | null;
  lastCleanupRun: string | null;
  expiredLast24h: number;
  cleanedLast24h: number;
  expiredLast7d: number;
  cleanedLast7d: number;
}

export function SystemHealthCard() {
  const { tenant } = useTenant();
  const { t } = useI18n();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['system-health', tenant?.id],
    queryFn: async (): Promise<JobMetrics> => {
      if (!tenant?.id) {
        return {
          lastExpireRun: null,
          lastCleanupRun: null,
          expiredLast24h: 0,
          cleanedLast24h: 0,
          expiredLast7d: 0,
          cleanedLast7d: 0,
        };
      }

      const now = new Date();
      const oneDayAgo = subHours(now, 24).toISOString();
      const sevenDaysAgo = subDays(now, 7).toISOString();

      // Fetch all relevant audit logs in one query
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('event_type, created_at')
        .eq('tenant_id', tenant.id)
        .in('event_type', ['MEMBERSHIP_EXPIRED', 'MEMBERSHIP_ABANDONED_CLEANUP'])
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false });

      // Process the logs
      let lastExpireRun: string | null = null;
      let lastCleanupRun: string | null = null;
      let expiredLast24h = 0;
      let cleanedLast24h = 0;
      let expiredLast7d = 0;
      let cleanedLast7d = 0;

      logs?.forEach(log => {
        const logDate = new Date(log.created_at);
        
        if (log.event_type === 'MEMBERSHIP_EXPIRED') {
          if (!lastExpireRun) lastExpireRun = log.created_at;
          expiredLast7d++;
          if (logDate >= new Date(oneDayAgo)) expiredLast24h++;
        }
        
        if (log.event_type === 'MEMBERSHIP_ABANDONED_CLEANUP') {
          if (!lastCleanupRun) lastCleanupRun = log.created_at;
          cleanedLast7d++;
          if (logDate >= new Date(oneDayAgo)) cleanedLast24h++;
        }
      });

      return {
        lastExpireRun,
        lastCleanupRun,
        expiredLast24h,
        cleanedLast24h,
        expiredLast7d,
        cleanedLast7d,
      };
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return t('health.noData');
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffHours < 24) {
      return `${diffHours}h atrás`;
    }
    return format(date, 'dd/MM HH:mm');
  };

  const isHealthy = metrics?.lastExpireRun || metrics?.lastCleanupRun;

  if (!tenant) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('health.title')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('health.title')}</CardTitle>
          </div>
          <Badge variant={isHealthy ? 'default' : 'secondary'} className="text-xs">
            {isHealthy ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                {t('health.allSystemsOperational')}
              </>
            ) : (
              <>
                <Clock className="h-3 w-3 mr-1" />
                {t('health.noData')}
              </>
            )}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {t('health.titleDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t('health.lastExpireRun')}</span>
              </div>
              <p className="font-medium">{formatTime(metrics?.lastExpireRun || null)}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t('health.lastCleanupRun')}</span>
              </div>
              <p className="font-medium">{formatTime(metrics?.lastCleanupRun || null)}</p>
            </div>
            <div className="col-span-2 border-t border-border pt-3 mt-1">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-lg font-bold text-primary">{metrics?.expiredLast24h || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{t('health.expiredLast24h')}</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-lg font-bold text-primary">{metrics?.cleanedLast24h || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{t('health.cleanedLast24h')}</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-lg font-bold text-primary">{metrics?.expiredLast7d || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{t('health.expiredLast7d')}</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-lg font-bold text-primary">{metrics?.cleanedLast7d || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{t('health.cleanedLast7d')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
