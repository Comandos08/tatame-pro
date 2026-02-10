/**
 * 🔍 SystemHealth — HEALTH1.0 SAFE GOLD
 * 
 * Admin Global System Health Dashboard.
 * READ-ONLY — Zero mutations.
 * NO TenantContext — NO Impersonation.
 * 
 * Access: SUPERADMIN_GLOBAL only
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCw, ArrowLeft, Clock, Shield, AlertTriangle, Users, CreditCard, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useSystemHealthStatus } from '@/hooks/useSystemHealthStatus';
import { 
  HealthStatusBadge, 
  JobsHealthCard, 
  CriticalEventsCard,
  AlertsPanel,
  AlertBadge,
} from '@/components/observability';
import { LoadingState } from '@/components/ux';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';
import { formatRelativeTime } from '@/lib/i18n/formatters';
import { auditEvent } from '@/lib/audit/auditEvent';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { 
  normalizeHealthViewState, 
  normalizeHealthStatus,
  getHealthAccessDenialReason,
} from '@/domain/health/normalize';
import type { SafeHealthStatus, SafeHealthViewState } from '@/types/health-state';

// ============================================
// SAFE GOLD: BILLING HEALTH CARD (READ-ONLY)
// ============================================

function BillingHealthCard() {
  const { t } = useI18n();
  
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin-health-billing-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_billing')
        .select('status');
      
      if (error) throw error;
      
      const counts = { active: 0, trialing: 0, issues: 0 };
      (data || []).forEach((b) => {
        if (b.status === 'ACTIVE') counts.active++;
        else if (b.status === 'TRIALING') counts.trialing++;
        else if (['PAST_DUE', 'UNPAID', 'CANCELED', 'INCOMPLETE'].includes(b.status ?? '')) {
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
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          {t('observability.billing.title')}
        </CardTitle>
        <CardDescription className="text-xs">
          {t('observability.billing.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
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

// ============================================
// SAFE GOLD: MEMBERSHIP HEALTH CARD (READ-ONLY)
// ============================================

function MembershipHealthCard() {
  const { t } = useI18n();
  
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin-health-membership-metrics'],
    queryFn: async () => {
      const [activeRes, pendingRes, expiredRes] = await Promise.all([
        supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
        supabase.from('memberships').select('id', { count: 'exact', head: true }).in('status', ['PENDING_PAYMENT', 'PENDING_REVIEW']),
        supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'EXPIRED'),
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
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          {t('observability.memberships.title')}
        </CardTitle>
        <CardDescription className="text-xs">
          {t('observability.memberships.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
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

// ============================================
// MAIN COMPONENT: SystemHealth (HEALTH1.0)
// ============================================

export default function SystemHealth() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { currentUser, isGlobalSuperadmin, isLoading: authLoading, session } = useCurrentUser();
  const { data: health, isLoading: healthLoading, refetch, isFetching } = useSystemHealthStatus();
  
  // SAFE GOLD: Derive deterministic states
  const isAuthenticated = !!session;
  const userRole = isGlobalSuperadmin ? 'SUPERADMIN_GLOBAL' : null;
  const isImpersonating = false; // HEALTH routes never use impersonation
  
  // SAFE GOLD: Check access (pure function)
  const denialReason = getHealthAccessDenialReason(isAuthenticated, userRole, isImpersonating);
  const hasAccess = denialReason === null;
  
  // SAFE GOLD: Derive view state deterministically
  const viewState: SafeHealthViewState = healthLoading 
    ? 'LOADING' 
    : normalizeHealthViewState(health);
  
  // SAFE GOLD: Derive health status deterministically
  const healthStatus: SafeHealthStatus = health?.overall 
    ? normalizeHealthStatus(health.overall) 
    : 'UNKNOWN';
  
  // SAFE GOLD: Audit access (fire-and-forget, no blocking)
  React.useEffect(() => {
    if (authLoading) return;
    
    const logAccess = async () => {
      try {
        if (hasAccess && currentUser?.id) {
          auditEvent({
            event_type: 'HEALTH_PAGE_ACCESSED',
            tenant_id: null,
            profile_id: currentUser.id,
            effective_role: 'SUPERADMIN_GLOBAL',
            metadata: {
              route: '/admin/health',
              tenant_context: null,
            },
          });
        } else if (!hasAccess && denialReason) {
          auditEvent({
            event_type: 'HEALTH_ACCESS_DENIED',
            tenant_id: null,
            profile_id: currentUser?.id ?? null,
            metadata: {
              reason: denialReason,
              route: '/admin/health',
            },
          });
        }
      } catch {
        // Silent fail — audit should never block UI
      }
    };
    
    logAccess();
  }, [authLoading, hasAccess, denialReason, currentUser?.id]);
  
  // SAFE GOLD: Loading state (no redirect during load)
  if (authLoading) {
    return <LoadingState titleKey="common.loading" variant="fullscreen" />;
  }
  
  // SAFE GOLD: Access denied (explicit UI, no redirect)
  if (!hasAccess) {
    return (
      <div 
        className="min-h-screen bg-background flex items-center justify-center p-4"
        data-testid="health-access-denied"
        data-health-denial-reason={denialReason}
      >
        <BlockedStateCard
          icon={AlertTriangle}
          iconVariant="destructive"
          titleKey="errors.accessDenied"
          descriptionKey={
            denialReason === 'NOT_AUTHENTICATED'
              ? 'errors.notAuthenticated'
              : denialReason === 'IMPERSONATION_FORBIDDEN'
              ? 'errors.impersonationForbidden'
              : 'errors.insufficientRole'
          }
          actions={[{
            labelKey: 'common.goBack',
            onClick: () => navigate('/portal'),
          }]}
        />
      </div>
    );
  }
  
  return (
    <div 
      className="min-h-screen bg-background"
      data-testid="system-health-page"
      data-health-status={healthStatus}
      data-health-view-state={viewState}
      data-health-route="/admin/health"
      data-health-context="ADMIN_GLOBAL"
    >
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
                      {formatRelativeTime(health.updatedAt, locale)}
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

          {/* PI C4.3: Audit as Observability Section */}
          <div className="mt-6" id="audit">
            <Card 
              className="card-hover cursor-pointer"
              onClick={() => navigate('/admin/audit')}
            >
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('observability.audit.sectionLabel')}
                    </span>
                  </div>
                  <CardTitle className="text-base">{t('observability.audit.title')}</CardTitle>
                  <CardDescription>{t('observability.audit.description')}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
