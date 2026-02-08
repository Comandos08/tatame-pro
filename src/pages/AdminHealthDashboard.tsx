/**
 * 🔍 AdminHealthDashboard — P4.1.C / P4.2.C
 * 
 * Consolidated health dashboard for Superadmins.
 * READ-ONLY — Zero mutations.
 * Includes AlertsPanel integration for realtime alerts.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCw, ArrowLeft, Clock, AlertTriangle, Users, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useSystemHealthStatus } from '@/hooks/useSystemHealthStatus';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  HealthStatusBadge, 
  JobsHealthCard, 
  CriticalEventsCard,
  AlertsPanel,
  AlertBadge,
} from '@/components/observability';
import { LoadingState } from '@/components/ux';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Billing health metrics card
function BillingHealthCard() {
  const { t } = useI18n();
  
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['billing-health-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_billing')
        .select('status');
      
      if (error) throw error;
      
      const counts = {
        active: 0,
        trialing: 0,
        issues: 0,
      };
      
      (data || []).forEach(b => {
        if (b.status === 'ACTIVE') counts.active++;
        else if (b.status === 'TRIALING') counts.trialing++;
        else if (['PAST_DUE', 'UNPAID', 'CANCELED', 'INCOMPLETE'].includes(b.status)) {
          counts.issues++;
        }
      });
      
      return counts;
    },
    staleTime: 5 * 60 * 1000,
  });
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{t('observability.billing.title')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('observability.billing.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-success/10 rounded-lg">
              <p className="text-2xl font-bold text-success">{metrics?.active || 0}</p>
              <p className="text-xs text-muted-foreground">{t('observability.billing.active')}</p>
            </div>
            <div className="text-center p-3 bg-info/10 rounded-lg">
              <p className="text-2xl font-bold text-info">{metrics?.trialing || 0}</p>
              <p className="text-xs text-muted-foreground">{t('observability.billing.trialing')}</p>
            </div>
            <div className={cn(
              'text-center p-3 rounded-lg',
              (metrics?.issues || 0) > 0 ? 'bg-destructive/10' : 'bg-muted/50'
            )}>
              <p className={cn(
                'text-2xl font-bold',
                (metrics?.issues || 0) > 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {metrics?.issues || 0}
              </p>
              <p className="text-xs text-muted-foreground">{t('observability.billing.issues')}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Membership health metrics card
function MembershipHealthCard() {
  const { t } = useI18n();
  
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['membership-health-metrics'],
    queryFn: async () => {
      const [activeRes, pendingRes, expiredRes] = await Promise.all([
        supabase.from('memberships').select('id', { count: 'exact', head: true })
          .eq('status', 'ACTIVE'),
        supabase.from('memberships').select('id', { count: 'exact', head: true })
          .in('status', ['PENDING_PAYMENT', 'PENDING_REVIEW']),
        supabase.from('memberships').select('id', { count: 'exact', head: true })
          .eq('status', 'EXPIRED'),
      ]);
      
      return {
        active: activeRes.count || 0,
        pending: pendingRes.count || 0,
        expired: expiredRes.count || 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{t('observability.memberships.title')}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {t('observability.memberships.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-success/10 rounded-lg">
              <p className="text-2xl font-bold text-success">{metrics?.active || 0}</p>
              <p className="text-xs text-muted-foreground">{t('observability.memberships.active')}</p>
            </div>
            <div className="text-center p-3 bg-warning/10 rounded-lg">
              <p className="text-2xl font-bold text-warning">{metrics?.pending || 0}</p>
              <p className="text-xs text-muted-foreground">{t('observability.memberships.pending')}</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-muted-foreground">{metrics?.expired || 0}</p>
              <p className="text-xs text-muted-foreground">{t('observability.memberships.expired')}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminHealthDashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  const { data: health, isLoading: healthLoading, refetch, isFetching } = useSystemHealthStatus();
  
  // Redirect non-superadmins
  React.useEffect(() => {
    if (!authLoading && !isGlobalSuperadmin) {
      navigate('/portal');
    }
  }, [authLoading, isGlobalSuperadmin, navigate]);
  
  if (authLoading) {
    return <LoadingState titleKey="common.loading" variant="fullscreen" />;
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Activity className="h-6 w-6 text-primary" />
              <div>
                <h1 className="font-display text-lg font-bold">{t('observability.dashboard.title')}</h1>
                <p className="text-xs text-muted-foreground">{t('observability.dashboard.subtitle')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {health && (
              <HealthStatusBadge status={health.overall} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
              {t('common.refresh')}
            </Button>
            {/* P4.2: Alerts Panel integration */}
            <AlertsPanel 
              trigger={<AlertBadge showZero className="ml-1" />}
            />
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Overall Status */}
          {health && (
            <Card className="mb-6">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <HealthStatusBadge status={health.overall} />
                    <div className="text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 inline mr-1" />
                      {t('observability.dashboard.lastUpdate')}: {' '}
                      {formatDistanceToNow(new Date(health.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-success">{health.summary.ok} {t('observability.status.ok')}</span>
                    <span className="text-warning">{health.summary.degraded} {t('observability.status.degraded')}</span>
                    <span className="text-destructive">{health.summary.critical} {t('observability.status.critical')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Health Checks Detail */}
          {health?.checks && health.checks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                {t('observability.dashboard.healthChecks')}
              </h2>
              <div className="grid gap-3">
                {health.checks.map((check, index) => (
                  <Card key={index} className="border-l-4" style={{
                    borderLeftColor: check.status === 'OK' ? 'hsl(var(--success))' :
                      check.status === 'DEGRADED' ? 'hsl(var(--warning))' :
                      check.status === 'CRITICAL' ? 'hsl(var(--destructive))' :
                      'hsl(var(--muted-foreground))'
                  }}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{check.name}</p>
                          {check.reason && (
                            <p className="text-sm text-muted-foreground">{check.reason}</p>
                          )}
                          {check.recommendation && (
                            <p className="text-xs text-info mt-1">💡 {check.recommendation}</p>
                          )}
                        </div>
                        <HealthStatusBadge status={check.status} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* Metrics Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <JobsHealthCard />
            <BillingHealthCard />
            <MembershipHealthCard />
          </div>
          
          {/* Critical Events */}
          <div className="mt-6">
            <CriticalEventsCard />
          </div>
        </motion.div>
      </main>
    </div>
  );
}
