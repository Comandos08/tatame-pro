/**
 * 🔍 SystemHealth — HEALTH1.0 SAFE GOLD + PI E3.1
 * 
 * Admin Global System Health Dashboard.
 * READ-ONLY — Zero mutations.
 * NO TenantContext — NO Impersonation.
 * 
 * Access: SUPERADMIN_GLOBAL only
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCw, ArrowLeft, AlertTriangle, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useSystemHealthStatus } from '@/hooks/useSystemHealthStatus';
import { 
  HealthStatusBadge,
  HealthBanner,
  JobsHealthCard, 
  CriticalEventsCard,
  InstitutionalErrorsCard,
  DependenciesCard,
  AlertsPanel,
  AlertBadge,
  SecurityPostureBanner,
} from '@/components/observability';
import { LoadingState } from '@/components/ux';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';
import { auditEvent } from '@/lib/audit/auditEvent';
import { cn } from '@/lib/utils';
import { useSecurityAutoAlert } from '@/hooks/admin/useSecurityAutoAlert';
import { 
  normalizeHealthViewState, 
  normalizeHealthStatus,
  getHealthAccessDenialReason,
} from '@/domain/health/normalize';
import type { SafeHealthStatus, SafeHealthViewState } from '@/types/health-state';

// ============================================
// MAIN COMPONENT: SystemHealth (HEALTH1.0 + PI E3.1)
// ============================================

export default function SystemHealth() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { currentUser, isGlobalSuperadmin, isLoading: authLoading, session } = useCurrentUser();
  const { data: health, isLoading: healthLoading, refetch, isFetching } = useSystemHealthStatus();
  useSecurityAutoAlert();
  
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
            onClick: () => navigate('/admin'),
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
          {/* O01.1: Security Posture Banner */}
          <SecurityPostureBanner className="mb-6" />

          {/* PI E3.1: Institutional Health Banner */}
          {health && (
            <HealthBanner status={health.overall} className="mb-6" />
          )}
          
          {/* PI E3.1: Health Checks Detail */}
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
                        </div>
                        <HealthStatusBadge status={check.status} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* PI E3.1: Indicator Cards (Read-only) */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <JobsHealthCard />
            <InstitutionalErrorsCard />
            <DependenciesCard health={health} isLoading={healthLoading} />
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
