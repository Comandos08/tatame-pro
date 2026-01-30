/**
 * SUPERADMIN DIAGNOSTICS — Platform-Level View
 * 
 * CONSTRAINTS (per approval):
 * 1. Does NOT use TenantContext — uses ?tenantId= query param
 * 2. Strictly READ-ONLY — no mutations
 * 3. No PII exposure — only operation types and timestamps
 * 4. Explicit distinction between "no data" vs "no permission"
 * 5. Purpose: diagnostics and support
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Activity, AlertTriangle, ArrowLeft, Clock, 
  CreditCard, Info, RefreshCw, Shield, Building2, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlatformDiagnostics, useTenantDiagnostics, type DiagnosticsStatus } from '@/hooks/useTenantDiagnostics';
import { useI18n } from '@/contexts/I18nContext';

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

export default function AdminDiagnostics() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId');

  // Platform-level data (no TenantContext)
  const { data: platformData, isLoading: platformLoading, refetch: refetchPlatform } = usePlatformDiagnostics();
  
  // Tenant-specific data (only if tenantId is provided via query param)
  const { diagnostics: tenantDiagnostics, isLoading: tenantLoading, refetch: refetchTenant } = useTenantDiagnostics(tenantId);

  const isLoading = platformLoading || (tenantId && tenantLoading);

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return t('diagnostics.noData');
    return new Date(ts).toLocaleString();
  };

  const getSeverityVariant = (severity: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (severity?.toUpperCase()) {
      case 'ERROR': return 'destructive';
      case 'WARNING': return 'secondary';
      case 'INFO': return 'default';
      default: return 'outline';
    }
  };

  const handleTenantSelect = (value: string) => {
    if (value === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ tenantId: value });
    }
  };

  const handleRefresh = () => {
    refetchPlatform();
    if (tenantId) refetchTenant();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('diagnostics.title')}</h1>
            <p className="text-muted-foreground">{t('diagnostics.description')}</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
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

      {/* Tenant Selector (no TenantContext - uses query param) */}
      {platformData?.tenants && platformData.tenants.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('diagnostics.tenantFilter')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={tenantId || 'all'} onValueChange={handleTenantSelect}>
              <SelectTrigger>
                <SelectValue placeholder={t('diagnostics.selectTenant')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('diagnostics.allTenants')}</SelectItem>
                {platformData.tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.slug}) {!tenant.is_active && '⚠️'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-2">
              {t('diagnostics.tenantFilterHint')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Platform Status */}
      {platformData?.tenantsStatus === 'no_permission' ? (
        <NoPermissionCard />
      ) : platformData?.tenantsStatus === 'no_data' ? (
        <NoDataCard />
      ) : (
        <>
          {/* Platform Overview */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                {t('diagnostics.platformHealth')}
              </CardTitle>
              <CardDescription>
                {t('diagnostics.platformHealthDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">{t('diagnostics.totalTenants')}</p>
                <p className="text-2xl font-bold">{platformData?.tenants?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('diagnostics.activeTenants')}</p>
                <p className="text-2xl font-bold">
                  {platformData?.tenants?.filter(t => t.is_active).length ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('diagnostics.inactiveTenants')}</p>
                <p className="text-2xl font-bold text-warning">
                  {platformData?.tenants?.filter(t => !t.is_active).length ?? 0}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tenant-Specific Diagnostics (if selected) */}
          {tenantId && tenantDiagnostics && (
            <>
              {tenantDiagnostics.status === 'no_permission' ? (
                <NoPermissionCard />
              ) : (
                <>
                  {/* Billing State */}
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        {t('diagnostics.billingState')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('diagnostics.status')}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={tenantDiagnostics.billingStatus === 'ACTIVE' ? 'default' : 'secondary'}>
                            {tenantDiagnostics.billingStatus || 'UNKNOWN'}
                          </Badge>
                          {tenantDiagnostics.isManualOverride && (
                            <Badge variant="outline">Override</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('diagnostics.decisionSource')}</p>
                        <p className="font-medium mt-1">{tenantDiagnostics.billingSource || 'N/A'}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-sm text-muted-foreground">{t('diagnostics.lastResolution')}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-4 w-4" />
                          <span>{formatTimestamp(tenantDiagnostics.lastSuccessfulResolution)}</span>
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
                        <DiagnosticsStatusBadge status={tenantDiagnostics.decisionsStatus} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {tenantDiagnostics.decisionsStatus === 'no_permission' ? (
                        <p className="text-destructive">{t('diagnostics.noPermission')}</p>
                      ) : tenantDiagnostics.recentDecisions.length > 0 ? (
                        <div className="space-y-2">
                          {tenantDiagnostics.recentDecisions.map((decision) => (
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
                        <DiagnosticsStatusBadge status={tenantDiagnostics.securityEventsStatus} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {tenantDiagnostics.securityEventsStatus === 'no_permission' ? (
                        <p className="text-destructive">{t('diagnostics.noPermission')}</p>
                      ) : tenantDiagnostics.recentSecurityEvents.length > 0 ? (
                        <div className="space-y-2">
                          {tenantDiagnostics.recentSecurityEvents.map((event) => (
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
            </>
          )}

          {/* Platform-Wide Recent Decisions (when no tenant selected) */}
          {!tenantId && platformData?.recentDecisions && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    {t('diagnostics.platformDecisions')}
                  </CardTitle>
                  <DiagnosticsStatusBadge status={platformData.decisionsStatus} />
                </div>
              </CardHeader>
              <CardContent>
                {platformData.decisionsStatus === 'no_permission' ? (
                  <p className="text-destructive">{t('diagnostics.noPermission')}</p>
                ) : platformData.recentDecisions.length > 0 ? (
                  <div className="space-y-2">
                    {platformData.recentDecisions.map((decision) => (
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
          )}
        </>
      )}

      {/* Data Fetch Timestamp */}
      <p className="text-xs text-muted-foreground text-center mt-6">
        {t('diagnostics.dataFetchedAt')}: {platformData?.dataFetchedAt ? formatTimestamp(platformData.dataFetchedAt) : '—'}
      </p>
    </div>
  );
}
