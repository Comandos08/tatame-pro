import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Loader2,
  TrendingUp,
  Server,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { format, subHours, subDays } from "date-fns";

interface PlatformMetrics {
  // Job execution metrics
  lastExpireMembershipsRun: string | null;
  lastCleanupAbandonedRun: string | null;
  lastTrialCheckRun: string | null;
  
  // Counts from last 24h/7d
  expiredLast24h: number;
  expiredLast7d: number;
  cleanedLast24h: number;
  cleanedLast7d: number;
  
  // Error metrics
  webhookErrorsLast24h: number;
  billingErrorsLast7d: number;
  
  // Tenant health
  tenantsBlocked: number;
  tenantsPastDue: number;
}

/**
 * Platform Health Card for Superadmin Dashboard
 * 
 * Displays:
 * - Job execution status (last runs)
 * - Error counts from audit logs
 * - Tenant billing health summary
 */
export function PlatformHealthCard() {
  const { t } = useI18n();
  
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['platform-health-metrics'],
    queryFn: async (): Promise<PlatformMetrics> => {
      const now = new Date();
      const oneDayAgo = subHours(now, 24).toISOString();
      const sevenDaysAgo = subDays(now, 7).toISOString();

      // Fetch audit logs for job metrics - without tenant filter for global view
      const { data: jobLogs } = await supabase
        .from('audit_logs')
        .select('event_type, created_at, metadata')
        .in('event_type', [
          'MEMBERSHIP_EXPIRED', 
          'MEMBERSHIP_ABANDONED_CLEANUP',
          'TRIAL_END_NOTIFICATION_SENT',
          'TENANT_PAYMENT_FAILED'
        ])
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false });

      // Process job logs
      let lastExpireMembershipsRun: string | null = null;
      let lastCleanupAbandonedRun: string | null = null;
      let lastTrialCheckRun: string | null = null;
      let expiredLast24h = 0;
      let expiredLast7d = 0;
      let cleanedLast24h = 0;
      let cleanedLast7d = 0;
      let billingErrorsLast7d = 0;

      jobLogs?.forEach(log => {
        const logDate = new Date(log.created_at);
        const isLast24h = logDate >= new Date(oneDayAgo);
        
        switch (log.event_type) {
          case 'MEMBERSHIP_EXPIRED':
            if (!lastExpireMembershipsRun) lastExpireMembershipsRun = log.created_at;
            expiredLast7d++;
            if (isLast24h) expiredLast24h++;
            break;
          case 'MEMBERSHIP_ABANDONED_CLEANUP':
            if (!lastCleanupAbandonedRun) lastCleanupAbandonedRun = log.created_at;
            cleanedLast7d++;
            if (isLast24h) cleanedLast24h++;
            break;
          case 'TRIAL_END_NOTIFICATION_SENT':
            if (!lastTrialCheckRun) lastTrialCheckRun = log.created_at;
            break;
          case 'TENANT_PAYMENT_FAILED':
            billingErrorsLast7d++;
            break;
        }
      });

      // Fetch webhook errors
      const { data: webhookEvents } = await supabase
        .from('webhook_events')
        .select('id, status')
        .eq('status', 'error')
        .gte('created_at', oneDayAgo);

      const webhookErrorsLast24h = webhookEvents?.length || 0;

      // Fetch tenant billing issues
      const { data: billingIssues } = await supabase
        .from('tenant_billing')
        .select('status')
        .in('status', ['PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE']);

      let tenantsBlocked = 0;
      let tenantsPastDue = 0;

      billingIssues?.forEach(b => {
        if (b.status === 'CANCELED' || b.status === 'UNPAID') {
          tenantsBlocked++;
        } else if (b.status === 'PAST_DUE' || b.status === 'INCOMPLETE') {
          tenantsPastDue++;
        }
      });

      return {
        lastExpireMembershipsRun,
        lastCleanupAbandonedRun,
        lastTrialCheckRun,
        expiredLast24h,
        expiredLast7d,
        cleanedLast24h,
        cleanedLast7d,
        webhookErrorsLast24h,
        billingErrorsLast7d,
        tenantsBlocked,
        tenantsPastDue,
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return t('platformHealth.neverRan');
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffHours < 1) return t('platformHealth.lessThan1h');
    if (diffHours < 24) return t('platformHealth.hoursAgo').replace('{h}', String(diffHours));
    return format(date, 'dd/MM HH:mm');
  };

  const getJobStatus = (lastRun: string | null): { status: string; color: 'default' | 'secondary' | 'destructive'; label: string; tooltip: string } => {
    if (!lastRun) return { 
      status: 'unknown', 
      color: 'secondary', 
      label: t('platformHealth.noData'),
      tooltip: t('platformHealth.noDataTooltip')
    };
    
    const hoursSinceRun = (Date.now() - new Date(lastRun).getTime()) / 3600000;
    
    if (hoursSinceRun < 25) return { 
      status: 'ok', 
      color: 'default',
      label: t('platformHealth.ok'),
      tooltip: t('platformHealth.okTooltip')
    };
    if (hoursSinceRun < 48) return { 
      status: 'warning', 
      color: 'secondary',
      label: t('platformHealth.delayed'),
      tooltip: t('platformHealth.delayedTooltip')
    };
    return { 
      status: 'error', 
      color: 'destructive',
      label: t('platformHealth.error'),
      tooltip: t('platformHealth.errorTooltip')
    };
  };

  const hasIssues = metrics && (
    metrics.webhookErrorsLast24h > 0 || 
    metrics.tenantsBlocked > 0 || 
    metrics.tenantsPastDue > 0
  );

  const allJobsHealthy = metrics && 
    getJobStatus(metrics.lastExpireMembershipsRun).status === 'ok' &&
    getJobStatus(metrics.lastCleanupAbandonedRun).status === 'ok';

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>{t('platformHealth.loadError')}</span>
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
            <Server className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('platformHealth.title')}</CardTitle>
          </div>
          <Badge variant={allJobsHealthy && !hasIssues ? 'default' : hasIssues ? 'destructive' : 'secondary'}>
            {allJobsHealthy && !hasIssues ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                {t('platformHealth.operational')}
              </>
            ) : hasIssues ? (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t('platformHealth.attentionNeeded')}
              </>
            ) : (
              <>
                <Clock className="h-3 w-3 mr-1" />
                {t('platformHealth.checking')}
              </>
            )}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {t('platformHealth.statusDesc')}
          <span className="block mt-1 text-muted-foreground/70">
            {t('platformHealth.technicalNote')}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : metrics ? (
          <div className="space-y-4">
            {/* Job Status Section */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-primary" />
                {t('platformHealth.automaticJobs')}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('platformHealth.expireMemberships')}</p>
                    <p className="text-sm font-medium">{formatTime(metrics.lastExpireMembershipsRun)}</p>
                  </div>
                  <Badge 
                    variant={getJobStatus(metrics.lastExpireMembershipsRun).color} 
                    className="text-xs cursor-help"
                    title={getJobStatus(metrics.lastExpireMembershipsRun).tooltip}
                  >
                    {getJobStatus(metrics.lastExpireMembershipsRun).label}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('platformHealth.cleanAbandoned')}</p>
                    <p className="text-sm font-medium">{formatTime(metrics.lastCleanupAbandonedRun)}</p>
                  </div>
                  <Badge 
                    variant={getJobStatus(metrics.lastCleanupAbandonedRun).color} 
                    className="text-xs cursor-help"
                    title={getJobStatus(metrics.lastCleanupAbandonedRun).tooltip}
                  >
                    {getJobStatus(metrics.lastCleanupAbandonedRun).label}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('platformHealth.checkTrials')}</p>
                    <p className="text-sm font-medium">{formatTime(metrics.lastTrialCheckRun)}</p>
                  </div>
                  <Badge 
                    variant={getJobStatus(metrics.lastTrialCheckRun).color} 
                    className="text-xs cursor-help"
                    title={getJobStatus(metrics.lastTrialCheckRun).tooltip}
                  >
                    {getJobStatus(metrics.lastTrialCheckRun).label}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Metrics Section */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" />
                {t('platformHealth.metrics7d')}
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="text-lg font-semibold">{metrics.expiredLast7d}</p>
                  <p className="text-xs text-muted-foreground">{t('platformHealth.expiredMemberships')}</p>
                  <p className="text-xs text-muted-foreground/70">{t('platformHealth.in24h').replace('{n}', String(metrics.expiredLast24h))}</p>
                </div>
                
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="text-lg font-semibold">{metrics.cleanedLast7d}</p>
                  <p className="text-xs text-muted-foreground">{t('platformHealth.abandonedCleaned')}</p>
                  <p className="text-xs text-muted-foreground/70">{t('platformHealth.in24h').replace('{n}', String(metrics.cleanedLast24h))}</p>
                </div>
                
                <div className={`text-center p-2 rounded-md ${metrics.webhookErrorsLast24h > 0 ? 'bg-destructive/10' : 'bg-muted/50'}`}>
                  <p className={`text-lg font-semibold ${metrics.webhookErrorsLast24h > 0 ? 'text-destructive' : ''}`}>
                    {metrics.webhookErrorsLast24h}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('platformHealth.webhookErrors24h')}</p>
                </div>
                
                <div className={`text-center p-2 rounded-md ${metrics.billingErrorsLast7d > 0 ? 'bg-warning/10' : 'bg-muted/50'}`}>
                  <p className={`text-lg font-semibold ${metrics.billingErrorsLast7d > 0 ? 'text-warning' : ''}`}>
                    {metrics.billingErrorsLast7d}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('platformHealth.paymentFailures')}</p>
                </div>
              </div>
            </div>

            {/* Tenant Health Section */}
            {(metrics.tenantsBlocked > 0 || metrics.tenantsPastDue > 0) && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  {t('platformHealth.tenantsWithIssues')}
                </h4>
                <div className="flex gap-4">
                  {metrics.tenantsBlocked > 0 && (
                    <div className="flex items-center gap-2 text-destructive">
                      <Badge variant="destructive">{metrics.tenantsBlocked}</Badge>
                      <span className="text-sm">{t('platformHealth.blocked')}</span>
                    </div>
                  )}
                  {metrics.tenantsPastDue > 0 && (
                    <div className="flex items-center gap-2 text-warning">
                      <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">
                        {metrics.tenantsPastDue}
                      </Badge>
                      <span className="text-sm">{t('platformHealth.latePayment')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
