/**
 * TENANT DIAGNOSTICS — Tenant-Scoped View
 * 
 * For ADMIN_TENANT only (canonical identity model — PI A1).
 * Uses TenantContext for current tenant.
 * Shows tenant-specific diagnostics data.
 * 
 * CONSTRAINTS:
 * 1. Strictly READ-ONLY — no mutations
 * 2. No PII exposure
 * 3. Explicit distinction between "no data" vs "no permission"
 */


import { useNavigate } from 'react-router-dom';
import { 
  Activity, AlertTriangle, ArrowLeft, Clock, 
  CreditCard, Info, RefreshCw, Shield, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTenantDiagnostics, type DiagnosticsStatus } from '@/hooks/useTenantDiagnostics';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useI18n } from '@/contexts/I18nContext';
import { formatDateTime } from '@/lib/i18n/formatters';

function DiagnosticsStatusBadge({ status }: { status: DiagnosticsStatus }) {
  switch (status) {
    case 'success':
      return <Badge variant="default">OK</Badge>;
    case 'no_data':
      return <Badge variant="secondary">No Data</Badge>;
    case 'no_permission':
      return <Badge variant="destructive">No Permission</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    case 'loading':
      return <Badge variant="outline">Loading...</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

function NoPermissionCard() {
  const { t } = useI18n();
  return (
    <Card className="border-destructive/50">
      <CardHeader className="text-center">
        <Lock className="h-8 w-8 text-destructive mx-auto mb-2" />
        <CardTitle>{t('diagnostics.noPermission')}</CardTitle>
        <CardDescription>
          {t('diagnostics.noPermissionDesc')}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function NoDataCard() {
  const { t } = useI18n();
  return (
    <Card className="border-muted">
      <CardHeader className="text-center">
        <Info className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <CardTitle>{t('diagnostics.noData')}</CardTitle>
        <CardDescription>
          {t('diagnostics.noDataDesc')}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function TenantDiagnostics() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { billingState } = useTenantStatus();
  const { diagnostics, isLoading, refetch, status } = useTenantDiagnostics(tenant?.id, billingState);

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return t('diagnostics.noData');
    return formatDateTime(ts, locale);
  };

  const getSeverityVariant = (severity: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (severity?.toUpperCase()) {
      case 'ERROR': return 'destructive';
      case 'WARNING': return 'secondary';
      case 'INFO': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('diagnostics.title')}</h1>
            <p className="text-muted-foreground">{t('diagnostics.description')}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('diagnostics.refresh')}
        </Button>
      </div>

      {/* Read-only warning */}
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>{t('diagnostics.readOnly')}</strong> — {t('diagnostics.readOnlyDesc')}
        </AlertDescription>
      </Alert>

      {/* Status-based rendering */}
      {status === 'no_permission' ? (
        <NoPermissionCard />
      ) : status === 'no_data' && !diagnostics ? (
        <NoDataCard />
      ) : (
        <>
          {/* Tenant Health */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                {t('diagnostics.tenantHealth')}
              </CardTitle>
              <CardDescription>{tenant?.name || 'N/A'}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">{t('diagnostics.billingState')}</p>
                <div className="flex items-center gap-2 mt-1">
                  <CreditCard className="h-4 w-4" />
                  <Badge variant={diagnostics?.billingStatus === 'ACTIVE' ? 'default' : 'secondary'}>
                    {diagnostics?.billingStatus || 'UNKNOWN'}
                  </Badge>
                  {diagnostics?.isManualOverride && (
                    <Badge variant="outline">Override</Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('diagnostics.decisionSource')}</p>
                <p className="font-medium mt-1">{diagnostics?.billingSource || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('diagnostics.lastResolution')}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4" />
                  <span>{formatTimestamp(diagnostics?.lastSuccessfulResolution || null)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Decisions */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t('diagnostics.recentDecisions')}
                </CardTitle>
                <DiagnosticsStatusBadge status={diagnostics?.decisionsStatus || 'loading'} />
              </div>
            </CardHeader>
            <CardContent>
              {diagnostics?.decisionsStatus === 'no_permission' ? (
                <p className="text-destructive">{t('diagnostics.noPermission')}</p>
              ) : diagnostics?.recentDecisions?.length ? (
                <div className="space-y-2">
                  {diagnostics.recentDecisions.map((decision) => (
                    <div key={decision.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={getSeverityVariant(decision.severity)}>
                          {decision.severity}
                        </Badge>
                        <span className="font-mono text-sm">{decision.operation || 'N/A'}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatTimestamp(decision.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">{t('diagnostics.noData')}</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Security Events */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  {t('diagnostics.recentEvents')}
                </CardTitle>
                <DiagnosticsStatusBadge status={diagnostics?.securityEventsStatus || 'loading'} />
              </div>
            </CardHeader>
            <CardContent>
              {diagnostics?.securityEventsStatus === 'no_permission' ? (
                <p className="text-destructive">{t('diagnostics.noPermission')}</p>
              ) : diagnostics?.recentSecurityEvents?.length ? (
                <div className="space-y-2">
                  {diagnostics.recentSecurityEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={getSeverityVariant(event.severity)}>
                          {event.severity}
                        </Badge>
                        <span className="font-mono text-sm">{event.event_type}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatTimestamp(event.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">{t('diagnostics.noData')}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Data Fetch Timestamp */}
      <p className="text-xs text-muted-foreground text-center mt-6">
        {t('diagnostics.dataFetchedAt')}: {diagnostics?.dataFetchedAt ? formatTimestamp(diagnostics.dataFetchedAt) : '—'}
      </p>
    </div>
  );
}
