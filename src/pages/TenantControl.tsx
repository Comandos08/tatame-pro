import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Building2, 
  Clock, 
  Shield, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  CalendarPlus,
  DollarSign,
  Ban,
  Unlock,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  AlertOctagon
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logger } from '@/lib/logger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { formatDateTime } from '@/lib/i18n/formatters';
import { useCurrentUser } from '@/contexts/AuthContext';

// Production safeguards
const MAX_TRIAL_DAYS = 90;
const MAX_PAID_MONTHS = 12;

interface TenantData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean | null;
  created_at: string | null;
}

interface BillingData {
  id: string;
  tenant_id: string;
  status: string;
  plan_name: string;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
  // Override tracking
  is_manual_override: boolean | null;
  override_by: string | null;
  override_at: string | null;
  override_reason: string | null;
}

interface AuditLogEntry {
  id: string;
  event_type: string;
  profile_id: string | null;
  created_at: string;
  metadata: {
    action?: string;
    reason?: string;
    previous_status?: string;
    new_status?: string;
    days?: number;
    until_date?: string;
    source?: string;
    previous_mode?: string;
    new_mode?: string;
    operator?: string;
  };
}

type ActionType = 'extend-trial' | 'mark-as-paid' | 'block-tenant' | 'unblock-tenant' | 'reset-to-stripe';

export default function TenantControl() {
  const { tenantId } = useParams<{ tenantId: string }>();
  
  const { t, locale } = useI18n();
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [overrideOperator, setOverrideOperator] = useState<{ name: string | null; email: string } | null>(null);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(30);
  const [untilDate, setUntilDate] = useState('');
  
  // Double confirmation state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: ActionType; payload: Record<string, unknown> } | null>(null);

  // Fetch tenant data
  const fetchData = async () => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      // Fetch tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name, slug, is_active, created_at')
        .eq('id', tenantId)
        .single();

      if (tenantError) throw tenantError;
      setTenant(tenantData);

      // Fetch billing with override fields
      const { data: billingData, error: billingError } = await supabase
        .from('tenant_billing')
        .select('id, tenant_id, status, plan_name, current_period_start, current_period_end, stripe_customer_id, stripe_subscription_id, created_at, updated_at, is_manual_override, override_by, override_at, override_reason')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (billingError) throw billingError;
      setBilling(billingData);

      // Fetch override operator profile if exists
      if (billingData?.override_by) {
        const { data: operatorData } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', billingData.override_by)
          .maybeSingle();
        
        setOverrideOperator(operatorData);
      } else {
        setOverrideOperator(null);
      }

      // Fetch audit logs related to billing overrides
      const { data: logsData, error: logsError } = await supabase
        .from('audit_logs')
        .select('id, event_type, profile_id, created_at, metadata')
        .eq('tenant_id', tenantId)
        .like('event_type', 'BILLING_OVERRIDE%')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setAuditLogs(logsData as AuditLogEntry[]);

    } catch (error) {
      logger.error('Error fetching tenant data:', error);
      toast.error(t('common.error'), { description: t('controlTower.loadError') });
    } finally {
      setLoading(false);
    }
  };

  // 🔐 Access control delegated to RequireGlobalRoles wrapper in App.tsx
  useEffect(() => {
    if (tenantId && isGlobalSuperadmin) {
      fetchData();
    }
  }, [tenantId, isGlobalSuperadmin]);

  // Open action dialog
  const openActionDialog = (action: ActionType) => {
    setCurrentAction(action);
    setReason('');
    setDays(30);
    
    // Set default until date to 30 days from now
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    setUntilDate(defaultDate.toISOString().split('T')[0]);
    
    setDialogOpen(true);
  };

  // Execute action (with optional double confirmation)
  const executeAction = async (forceConfirm: boolean = false) => {
    if (!currentAction || !tenantId || !reason.trim()) {
      toast.error(t('common.error'), { description: t('controlTower.reasonIsRequired') });
      return;
    }

    // Check if double confirmation is needed
    const needsDoubleConfirm = (currentAction === 'block-tenant' && billing?.status === 'ACTIVE') ||
                               currentAction === 'mark-as-paid';

    if (needsDoubleConfirm && !forceConfirm) {
      setPendingAction({
        action: currentAction as ActionType,
        payload: {
          action: currentAction,
          tenantId,
          reason: reason.trim(),
          untilDate: currentAction === 'mark-as-paid' ? untilDate : undefined,
          confirmBlock: currentAction === 'block-tenant' ? true : undefined,
        },
      });
      setDialogOpen(false);
      setConfirmDialogOpen(true);
      return;
    }

    await performAction({
      action: currentAction,
      tenantId,
      reason: reason.trim(),
      days: currentAction === 'extend-trial' ? days : undefined,
      untilDate: currentAction === 'mark-as-paid' ? untilDate : undefined,
      confirmBlock: currentAction === 'block-tenant' ? forceConfirm : undefined,
    });
  };

  // Actually perform the action
  const performAction = async (payload: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('admin-billing-control', {
        body: payload,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success(t('common.success'), { description: t('controlTower.actionSuccess') });

      setDialogOpen(false);
      setConfirmDialogOpen(false);
      setPendingAction(null);
      fetchData(); // Refresh data

    } catch (error) {
      logger.error('Action error:', error);
      toast.error(t('common.error'), { description: error instanceof Error ? error.message : t('controlTower.actionFailed') });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle confirmed action from double confirmation dialog
  const handleConfirmedAction = async () => {
    if (!pendingAction) return;
    await performAction(pendingAction.payload);
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      ACTIVE: { variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
      TRIALING: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
      PAST_DUE: { variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
      CANCELED: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
      UNPAID: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
      INCOMPLETE: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
    };

    const config = variants[status] || { variant: 'outline' as const, icon: null };

    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {status}
      </Badge>
    );
  };

  // Format date using centralized formatter
  const formatDisplayDate = (dateString: string | null) => {
    return formatDateTime(dateString, locale);
  };

  // Get action title
  const getActionTitle = (action: ActionType) => {
    const titles: Record<ActionType, string> = {
      'extend-trial': t('controlTower.extendTrial'),
      'mark-as-paid': t('controlTower.markAsPaid'),
      'block-tenant': t('controlTower.blockTenant'),
      'unblock-tenant': t('controlTower.unblockTenant'),
      'reset-to-stripe': t('controlTower.resetToStripe'),
    };
    return titles[action];
  };

  // Get action description
  const getActionDescription = (action: ActionType) => {
    const descriptions: Record<ActionType, string> = {
      'extend-trial': t('controlTower.extendTrialDesc'),
      'mark-as-paid': t('controlTower.markAsPaidDesc'),
      'block-tenant': t('controlTower.blockTenantDesc'),
      'unblock-tenant': t('controlTower.unblockTenantDesc'),
      'reset-to-stripe': t('controlTower.resetToStripeDesc'),
    };
    return descriptions[action];
  };

  // Calculate max date for mark-as-paid
  const getMaxPaidDate = () => {
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + MAX_PAID_MONTHS);
    return maxDate.toISOString().split('T')[0];
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t('controlTower.tenantNotFound')}</h2>
            <Button asChild className="mt-4">
              <Link to="/admin">{t('common.back')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isManualOverride = billing?.is_manual_override === true;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{t('controlTower.title')}</h1>
                <p className="text-sm text-muted-foreground">{tenant.name}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Manual Override Warning Banner */}
          {isManualOverride && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-destructive/10 border border-destructive/30 rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                <AlertOctagon className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-destructive mb-1">{t('controlTower.manualOverrideWarning')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('controlTower.manualOverrideWarningDesc')}
                  </p>
                  {billing?.override_reason && (
                    <p className="text-sm mt-2">
                      <span className="font-medium">{t('controlTower.reason')}:</span> {billing.override_reason}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                    {billing?.override_at && (
                      <span>{t('controlTower.overrideAppliedAt')}: {formatDisplayDate(billing.override_at)}</span>
                    )}
                    {billing?.override_by && (
                      <span>
                        {t('controlTower.overrideBy')}: {overrideOperator?.name || overrideOperator?.email || billing.override_by.slice(0, 8) + '...'}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openActionDialog('reset-to-stripe')}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t('controlTower.resetToStripe')}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Current Status Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    {t('controlTower.currentStatus')}
                  </CardTitle>
                  <CardDescription>{t('controlTower.billingInfo')}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchData}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('controlTower.refresh')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.status')}</p>
                  <div className="flex items-center gap-2">
                    {billing ? getStatusBadge(billing.status) : <Badge variant="outline">{t('controlTower.noRecord')}</Badge>}
                    {isManualOverride && (
                      <Badge variant="destructive" className="text-xs">{t('controlTower.manualMode')}</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.plan')}</p>
                  <p className="font-medium">{billing?.plan_name || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.tenantActive')}</p>
                  <Badge variant={tenant.is_active ? 'default' : 'destructive'}>
                    {tenant.is_active ? t('controlTower.yes') : t('controlTower.no')}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.periodStart')}</p>
                  <p className="font-medium">{formatDisplayDate(billing?.current_period_start || null)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.periodEnd')}</p>
                  <p className="font-medium">{formatDisplayDate(billing?.current_period_end || null)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.controlMode')}</p>
                  <Badge variant={isManualOverride ? 'destructive' : 'secondary'}>
                    {isManualOverride ? t('controlTower.manualMode') : t('controlTower.stripeMode')}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.stripeCustomer')}</p>
                  <p className="font-mono text-xs truncate">{billing?.stripe_customer_id || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('controlTower.stripeSubscription')}</p>
                  <p className="font-mono text-xs truncate">{billing?.stripe_subscription_id || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t('controlTower.overrideActions')}
              </CardTitle>
              <CardDescription>
                {t('controlTower.overrideActionsDesc')} {t('controlTower.trialLimit').replace('{days}', String(MAX_TRIAL_DAYS))}, {t('controlTower.paidLimit').replace('{months}', String(MAX_PAID_MONTHS))}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => openActionDialog('extend-trial')}
                >
                  <CalendarPlus className="h-6 w-6 text-blue-500" />
                  <span className="font-medium">{t('controlTower.extendTrial')}</span>
                  <span className="text-xs text-muted-foreground">{t('controlTower.maxDays').replace('{days}', String(MAX_TRIAL_DAYS))}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => openActionDialog('mark-as-paid')}
                >
                  <DollarSign className="h-6 w-6 text-green-500" />
                  <span className="font-medium">{t('controlTower.markAsPaid')}</span>
                  <span className="text-xs text-muted-foreground">{t('controlTower.requiresConfirm')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2 border-destructive/50 hover:border-destructive"
                  onClick={() => openActionDialog('block-tenant')}
                >
                  <Ban className="h-6 w-6 text-destructive" />
                  <span className="font-medium">{t('controlTower.blockTenant')}</span>
                  <span className="text-xs text-muted-foreground">{t('controlTower.forcePastDue')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => openActionDialog('unblock-tenant')}
                >
                  <Unlock className="h-6 w-6 text-emerald-500" />
                  <span className="font-medium">{t('controlTower.unblockTenant')}</span>
                  <span className="text-xs text-muted-foreground">{t('controlTower.plus30DaysActive')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => openActionDialog('reset-to-stripe')}
                  disabled={!isManualOverride}
                >
                  <RotateCcw className="h-6 w-6 text-primary" />
                  <span className="font-medium">{t('controlTower.resetToStripe')}</span>
                  <span className="text-xs text-muted-foreground">{t('controlTower.sync')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Audit History Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {t('controlTower.overrideHistory')}
              </CardTitle>
              <CardDescription>
                {t('controlTower.overrideHistoryDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>{t('controlTower.noOverrideActions')}</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-4 rounded-lg border bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {log.event_type.replace('BILLING_OVERRIDE_', '')}
                              </Badge>
                              {log.metadata?.previous_mode && log.metadata?.new_mode && (
                                <Badge 
                                  variant={log.metadata.new_mode === 'stripe' ? 'secondary' : 'destructive'} 
                                  className="text-xs"
                                >
                                  {log.metadata.previous_mode} → {log.metadata.new_mode}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDisplayDate(log.created_at)}
                              </span>
                            </div>
                            {log.metadata?.reason && (
                              <p className="text-sm mt-2">
                                <span className="font-medium">{t('controlTower.reason')}:</span> {log.metadata.reason}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                              {log.metadata?.previous_status && (
                                <span>
                                  {t('controlTower.previousStatus')}: <code>{log.metadata.previous_status}</code>
                                </span>
                              )}
                              {log.metadata?.new_status && (
                                <span>
                                  {t('controlTower.newStatus')}: <code>{log.metadata.new_status}</code>
                                </span>
                              )}
                              {log.metadata?.days && (
                                <span>
                                  {t('controlTower.days')}: <code>{log.metadata.days}</code>
                                </span>
                              )}
                              {log.metadata?.until_date && (
                                <span>
                                  {t('controlTower.until')}: <code>{log.metadata.until_date}</code>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentAction && getActionTitle(currentAction)}</DialogTitle>
            <DialogDescription>
              {currentAction && getActionDescription(currentAction)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {currentAction === 'extend-trial' && (
              <div className="space-y-2">
                <Label htmlFor="days">{t('controlTower.daysToAdd')} ({t('controlTower.maxDays').replace('{days}', String(MAX_TRIAL_DAYS))})</Label>
                <Input
                  id="days"
                  type="number"
                  min={1}
                  max={MAX_TRIAL_DAYS}
                  value={days}
                  onChange={(e) => setDays(Math.min(parseInt(e.target.value) || 1, MAX_TRIAL_DAYS))}
                />
              </div>
            )}

            {currentAction === 'mark-as-paid' && (
              <div className="space-y-2">
                <Label htmlFor="untilDate">{t('controlTower.validUntil')} ({t('controlTower.maxMonths').replace('{months}', String(MAX_PAID_MONTHS))})</Label>
                <Input
                  id="untilDate"
                  type="date"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  max={getMaxPaidDate()}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">{t('controlTower.reasonRequired')}</Label>
              <Textarea
                id="reason"
                placeholder={t('controlTower.reasonPlaceholder')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={actionLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => executeAction(false)}
              disabled={actionLoading || !reason.trim()}
              variant={currentAction === 'block-tenant' ? 'destructive' : 'default'}
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {(currentAction === 'block-tenant' && billing?.status === 'ACTIVE') || currentAction === 'mark-as-paid' 
                ? t('controlTower.continue') 
                : t('controlTower.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Double Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t('controlTower.confirmationNeeded')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.action === 'block-tenant' && t('controlTower.confirmBlockActive')}
              {pendingAction?.action === 'mark-as-paid' && t('controlTower.confirmMarkPaid')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedAction}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('controlTower.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
