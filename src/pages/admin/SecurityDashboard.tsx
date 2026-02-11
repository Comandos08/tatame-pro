/**
 * 🔐 SecurityDashboard — O01.1 SAFE GOLD
 * 
 * Admin Security Posture Dashboard.
 * READ-ONLY — Zero mutations.
 * NO TenantContext — NO Impersonation.
 * 
 * Access: SUPERADMIN_GLOBAL only
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, RefreshCw, AlertTriangle, Database, Lock, XCircle, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useSecurityPosture, type PolicyFinding, type DefinerFinding, type PiiExposureFinding } from '@/hooks/admin/useSecurityPosture';
import { LoadingState } from '@/components/ux';
import { BlockedStateCard } from '@/components/ux/BlockedStateCard';
import { auditEvent } from '@/lib/audit/auditEvent';
import { cn } from '@/lib/utils';
import { getHealthAccessDenialReason } from '@/domain/health/normalize';

// ============================================
// SUB-COMPONENTS
// ============================================

function SummaryCard({ label, value, variant }: { label: string; value: number; variant: 'critical' | 'high' | 'medium' | 'safe' | 'neutral' }) {
  const colorMap = {
    critical: 'bg-destructive/10 text-destructive border-destructive/20',
    high: 'bg-warning/10 text-warning border-warning/20',
    medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    safe: 'bg-success/10 text-success border-success/20',
    neutral: 'bg-muted/50 text-muted-foreground border-muted-foreground/20',
  };

  return (
    <Card className={cn('border', colorMap[variant])}>
      <CardContent className="pt-6 text-center">
        <p className="text-3xl font-display font-bold">{value}</p>
        <p className="text-sm mt-1 opacity-80">{label}</p>
      </CardContent>
    </Card>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const variants: Record<string, string> = {
    CRITICAL: 'bg-destructive/10 text-destructive border-destructive/30',
    HIGH: 'bg-warning/10 text-warning border-warning/30',
    MEDIUM: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    SAFE: 'bg-success/10 text-success border-success/30',
  };

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', variants[risk] || '')}>
      {risk}
    </Badge>
  );
}

function PolicyFindingsSection({ title, findings, icon: Icon, borderColor }: {
  title: string;
  findings: PolicyFinding[];
  icon: React.ElementType;
  borderColor: string;
}) {
  if (findings.length === 0) return null;

  return (
    <Card className={cn('border-l-4', borderColor)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" />
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="ml-auto">{findings.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {findings.map((f, i) => (
            <div key={`${f.table}-${f.policy}-${i}`} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{f.table}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="text-sm text-muted-foreground truncate">{f.policy}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{f.reason}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{f.cmd}</Badge>
                    <Badge variant="outline" className="text-xs">{f.permissive}</Badge>
                    {f.roles.map(r => (
                      <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                    ))}
                  </div>
                </div>
                <RiskBadge risk={f.risk} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DefinerFindingsSection({ findings }: { findings: DefinerFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-primary/40">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">SECURITY DEFINER Functions</CardTitle>
          <Badge variant="secondary" className="ml-auto">{findings.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {findings.map((f, i) => (
            <div key={`${f.schema}-${f.name}-${i}`} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-sm font-medium">{f.schema}.{f.name}</span>
                  <p className="text-sm text-muted-foreground mt-1">{f.reason}</p>
                </div>
                <RiskBadge risk={f.risk} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PiiExposureSection({ findings }: { findings: PiiExposureFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-warning/60">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 text-warning" />
          <CardTitle className="text-base">PII Exposure</CardTitle>
          <Badge variant="secondary" className="ml-auto">{findings.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {findings.map((f, i) => (
            <div key={`${f.table}-${f.policy}-${i}`} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{f.table}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="text-sm text-muted-foreground truncate">{f.policy}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{f.reason}</p>
                  <Badge variant="outline" className="text-xs mt-2">{f.cmd}</Badge>
                </div>
                <RiskBadge risk={f.risk} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TablesWithoutRlsSection({ tables }: { tables: string[] }) {
  if (tables.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-destructive/40">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">Tables Without RLS</CardTitle>
          <Badge variant="secondary" className="ml-auto">{tables.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {tables.map(t => (
            <Badge key={t} variant="outline" className="font-mono text-xs bg-destructive/5 text-destructive border-destructive/20">
              {t}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function SecurityDashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { currentUser, isGlobalSuperadmin, isLoading: authLoading, session } = useCurrentUser();
  const { report, postureState, refetch, isFetching } = useSecurityPosture();

  // SAFE GOLD: Access control
  const isAuthenticated = !!session;
  const userRole = isGlobalSuperadmin ? 'SUPERADMIN_GLOBAL' : null;
  const denialReason = getHealthAccessDenialReason(isAuthenticated, userRole, false);
  const hasAccess = denialReason === null;

  // Audit access
  React.useEffect(() => {
    if (authLoading) return;
    try {
      if (hasAccess && currentUser?.id) {
        auditEvent({
          event_type: 'SECURITY_DASHBOARD_ACCESSED',
          tenant_id: null,
          profile_id: currentUser.id,
          effective_role: 'SUPERADMIN_GLOBAL',
          metadata: { route: '/admin/security' },
        });
      }
    } catch {
      // Silent fail
    }
  }, [authLoading, hasAccess, currentUser?.id]);

  if (authLoading) {
    return <LoadingState titleKey="common.loading" variant="fullscreen" />;
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="security-access-denied">
        <BlockedStateCard
          icon={AlertTriangle}
          iconVariant="destructive"
          titleKey="errors.accessDenied"
          descriptionKey="errors.insufficientRole"
          actions={[{ labelKey: 'common.goBack', onClick: () => navigate('/portal') }]}
        />
      </div>
    );
  }

  const criticalFindings = report?.policies.filter(p => p.risk === 'CRITICAL') ?? [];
  const highFindings = report?.policies.filter(p => p.risk === 'HIGH') ?? [];
  const mediumFindings = report?.policies.filter(p => p.risk === 'MEDIUM') ?? [];
  const definerFindings = report?.securityDefinerFunctions ?? [];
  const piiFindings = report?.piiExposure ?? [];

  return (
    <div
      className="min-h-screen bg-background"
      data-testid="security-dashboard-page"
      data-security-posture={postureState}
    >
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/health')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <div>
                <h1 className="font-display text-lg font-bold">Security Posture</h1>
                <p className="text-xs text-muted-foreground">RLS & SECURITY DEFINER Audit</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RiskBadge risk={postureState === 'CRITICAL' ? 'CRITICAL' : postureState === 'WARNING' ? 'HIGH' : postureState === 'OK' ? 'SAFE' : 'MEDIUM'} />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {postureState === 'LOADING' && (
            <LoadingState titleKey="common.loading" variant="inline" />
          )}

          {postureState === 'ERROR' && (
            <Card className="border-muted-foreground/20 bg-muted/30">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Security audit data is unavailable. Try refreshing.</p>
              </CardContent>
            </Card>
          )}

          {report && (postureState === 'OK' || postureState === 'WARNING' || postureState === 'CRITICAL') && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                <SummaryCard label="Total Policies" value={report.summary.policies.total} variant="neutral" />
                <SummaryCard label="Critical" value={report.summary.policies.critical} variant="critical" />
                <SummaryCard label="High" value={report.summary.policies.high} variant="high" />
                <SummaryCard label="Medium" value={report.summary.policies.medium} variant="medium" />
                <SummaryCard label="SECURITY DEFINER" value={report.summary.securityDefinerFunctions.total} variant="neutral" />
                <SummaryCard label="Tables w/o RLS" value={report.summary.tablesWithoutRls} variant={report.summary.tablesWithoutRls > 0 ? 'critical' : 'safe'} />
                <SummaryCard label="PII Exposure" value={report.summary.piiExposure?.critical ?? 0} variant={(report.summary.piiExposure?.critical ?? 0) > 0 ? 'critical' : 'safe'} />
              </div>

              {/* Risk Matrix */}
              <div className="space-y-6">
                <PolicyFindingsSection
                  title="Critical Findings"
                  findings={criticalFindings}
                  icon={XCircle}
                  borderColor="border-l-destructive"
                />
                <PolicyFindingsSection
                  title="High-Risk Findings"
                  findings={highFindings}
                  icon={AlertTriangle}
                  borderColor="border-l-warning"
                />
                <PolicyFindingsSection
                  title="Medium-Risk Findings"
                  findings={mediumFindings}
                  icon={AlertTriangle}
                  borderColor="border-l-yellow-500"
                />

                {/* SECURITY DEFINER */}
                <DefinerFindingsSection findings={definerFindings} />

                {/* Tables Without RLS */}
                <TablesWithoutRlsSection tables={report.tablesWithoutRls} />

                {/* PII Exposure (PI-A08) */}
                <PiiExposureSection findings={piiFindings} />
              </div>
            </>
          )}

          {/* Timestamp */}
          {report?.timestamp && (
            <p className="text-xs text-muted-foreground text-right mt-6">
              Last audit: {new Date(report.timestamp).toLocaleString()}
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
