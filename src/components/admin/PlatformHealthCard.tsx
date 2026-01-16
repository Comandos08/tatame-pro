import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Loader2,
  TrendingUp,
  Server,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
    if (!dateStr) return 'Nunca executou';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffHours < 1) return 'Há menos de 1h';
    if (diffHours < 24) return `Há ${diffHours}h`;
    return format(date, 'dd/MM HH:mm');
  };

  const getJobStatus = (lastRun: string | null): { status: string; color: 'default' | 'secondary' | 'destructive'; label: string; tooltip: string } => {
    if (!lastRun) return { 
      status: 'unknown', 
      color: 'secondary', 
      label: 'Sem dados',
      tooltip: 'Nenhuma execução registrada. Verifique se os cron jobs estão configurados.'
    };
    
    const hoursSinceRun = (Date.now() - new Date(lastRun).getTime()) / 3600000;
    
    if (hoursSinceRun < 25) return { 
      status: 'ok', 
      color: 'default',
      label: 'OK',
      tooltip: 'Job executado nas últimas 24h. Funcionando normalmente.'
    };
    if (hoursSinceRun < 48) return { 
      status: 'warning', 
      color: 'secondary',
      label: 'Atrasado',
      tooltip: 'Job não executou há mais de 24h. Investigar cron/pg_net.'
    };
    return { 
      status: 'error', 
      color: 'destructive',
      label: 'Erro',
      tooltip: 'Job não executou há mais de 48h. Ação técnica necessária.'
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
            <span>Erro ao carregar métricas de saúde</span>
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
            <CardTitle className="text-base">Saúde da Plataforma</CardTitle>
          </div>
          <Badge variant={allJobsHealthy && !hasIssues ? 'default' : hasIssues ? 'destructive' : 'secondary'}>
            {allJobsHealthy && !hasIssues ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Operacional
              </>
            ) : hasIssues ? (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                Atenção Necessária
              </>
            ) : (
              <>
                <Clock className="h-3 w-3 mr-1" />
                Verificando
              </>
            )}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Status dos jobs automáticos e métricas de erros.
          <span className="block mt-1 text-muted-foreground/70">
            Nota: Ausência de eventos indica possível problema técnico nos jobs, não impacto direto nos usuários.
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
                Jobs Automáticos
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                  <div>
                    <p className="text-xs text-muted-foreground">Expirar Filiações</p>
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
                    <p className="text-xs text-muted-foreground">Limpar Abandonados</p>
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
                    <p className="text-xs text-muted-foreground">Checar Trials</p>
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
                Métricas (7 dias)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="text-lg font-semibold">{metrics.expiredLast7d}</p>
                  <p className="text-xs text-muted-foreground">Filiações expiradas</p>
                  <p className="text-xs text-muted-foreground/70">({metrics.expiredLast24h} em 24h)</p>
                </div>
                
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="text-lg font-semibold">{metrics.cleanedLast7d}</p>
                  <p className="text-xs text-muted-foreground">Abandonados limpos</p>
                  <p className="text-xs text-muted-foreground/70">({metrics.cleanedLast24h} em 24h)</p>
                </div>
                
                <div className={`text-center p-2 rounded-md ${metrics.webhookErrorsLast24h > 0 ? 'bg-destructive/10' : 'bg-muted/50'}`}>
                  <p className={`text-lg font-semibold ${metrics.webhookErrorsLast24h > 0 ? 'text-destructive' : ''}`}>
                    {metrics.webhookErrorsLast24h}
                  </p>
                  <p className="text-xs text-muted-foreground">Erros webhook (24h)</p>
                </div>
                
                <div className={`text-center p-2 rounded-md ${metrics.billingErrorsLast7d > 0 ? 'bg-warning/10' : 'bg-muted/50'}`}>
                  <p className={`text-lg font-semibold ${metrics.billingErrorsLast7d > 0 ? 'text-warning' : ''}`}>
                    {metrics.billingErrorsLast7d}
                  </p>
                  <p className="text-xs text-muted-foreground">Falhas pagamento</p>
                </div>
              </div>
            </div>

            {/* Tenant Health Section */}
            {(metrics.tenantsBlocked > 0 || metrics.tenantsPastDue > 0) && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Tenants com Problemas
                </h4>
                <div className="flex gap-4">
                  {metrics.tenantsBlocked > 0 && (
                    <div className="flex items-center gap-2 text-destructive">
                      <Badge variant="destructive">{metrics.tenantsBlocked}</Badge>
                      <span className="text-sm">bloqueados</span>
                    </div>
                  )}
                  {metrics.tenantsPastDue > 0 && (
                    <div className="flex items-center gap-2 text-warning">
                      <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">
                        {metrics.tenantsPastDue}
                      </Badge>
                      <span className="text-sm">com pagamento atrasado</span>
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
