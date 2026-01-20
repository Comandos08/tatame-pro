import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Building2, 
  Calendar, 
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
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';

interface TenantData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
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
  };
}

type ActionType = 'extend-trial' | 'mark-as-paid' | 'block-tenant' | 'unblock-tenant';

export default function TenantControl() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const { isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();

  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(30);
  const [untilDate, setUntilDate] = useState('');

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

      // Fetch billing
      const { data: billingData, error: billingError } = await supabase
        .from('tenant_billing')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (billingError) throw billingError;
      setBilling(billingData);

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
      console.error('Error fetching tenant data:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to load tenant data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isGlobalSuperadmin) {
      navigate('/admin');
      return;
    }
    
    if (tenantId && isGlobalSuperadmin) {
      fetchData();
    }
  }, [tenantId, authLoading, isGlobalSuperadmin]);

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

  // Execute action
  const executeAction = async () => {
    if (!currentAction || !tenantId || !reason.trim()) {
      toast({
        title: t('common.error'),
        description: 'Reason is required',
        variant: 'destructive',
      });
      return;
    }

    setActionLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('Not authenticated');
      }

      const payload: Record<string, unknown> = {
        action: currentAction,
        tenantId,
        reason: reason.trim(),
      };

      if (currentAction === 'extend-trial') {
        payload.days = days;
      } else if (currentAction === 'mark-as-paid') {
        payload.untilDate = untilDate;
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

      toast({
        title: t('common.success'),
        description: response.data?.message || 'Action completed successfully',
      });

      setDialogOpen(false);
      fetchData(); // Refresh data

    } catch (error) {
      console.error('Action error:', error);
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Action failed',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
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

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get action title
  const getActionTitle = (action: ActionType) => {
    const titles: Record<ActionType, string> = {
      'extend-trial': 'Estender Trial',
      'mark-as-paid': 'Marcar como Pago',
      'block-tenant': 'Bloquear Tenant',
      'unblock-tenant': 'Desbloquear Tenant',
    };
    return titles[action];
  };

  // Get action description
  const getActionDescription = (action: ActionType) => {
    const descriptions: Record<ActionType, string> = {
      'extend-trial': 'Adiciona dias extras ao período de trial do tenant.',
      'mark-as-paid': 'Força o status ACTIVE até a data especificada.',
      'block-tenant': 'Força o status PAST_DUE, bloqueando novas filiações.',
      'unblock-tenant': 'Remove o bloqueio e define ACTIVE por 30 dias.',
    };
    return descriptions[action];
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
            <h2 className="text-xl font-semibold mb-2">Tenant não encontrado</h2>
            <Button asChild className="mt-4">
              <Link to="/admin">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                <h1 className="text-xl font-bold">Control Tower</h1>
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
          {/* Current Status Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Status Atual
                  </CardTitle>
                  <CardDescription>Informações de billing do tenant</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchData}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  {billing ? getStatusBadge(billing.status) : <Badge variant="outline">Sem registro</Badge>}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Plano</p>
                  <p className="font-medium">{billing?.plan_name || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tenant Ativo</p>
                  <Badge variant={tenant.is_active ? 'default' : 'destructive'}>
                    {tenant.is_active ? 'Sim' : 'Não'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Período Início</p>
                  <p className="font-medium">{formatDate(billing?.current_period_start || null)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Período Fim</p>
                  <p className="font-medium">{formatDate(billing?.current_period_end || null)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Stripe Customer</p>
                  <p className="font-mono text-xs truncate">{billing?.stripe_customer_id || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Ações de Override
              </CardTitle>
              <CardDescription>
                Controles manuais para gerenciar o status de billing do tenant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => openActionDialog('extend-trial')}
                >
                  <CalendarPlus className="h-6 w-6 text-blue-500" />
                  <span className="font-medium">Estender Trial</span>
                  <span className="text-xs text-muted-foreground">Adicionar dias</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => openActionDialog('mark-as-paid')}
                >
                  <DollarSign className="h-6 w-6 text-green-500" />
                  <span className="font-medium">Marcar Pago</span>
                  <span className="text-xs text-muted-foreground">Forçar ACTIVE</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2 border-destructive/50 hover:border-destructive"
                  onClick={() => openActionDialog('block-tenant')}
                >
                  <Ban className="h-6 w-6 text-destructive" />
                  <span className="font-medium">Bloquear</span>
                  <span className="text-xs text-muted-foreground">Forçar PAST_DUE</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => openActionDialog('unblock-tenant')}
                >
                  <Unlock className="h-6 w-6 text-emerald-500" />
                  <span className="font-medium">Desbloquear</span>
                  <span className="text-xs text-muted-foreground">Remover bloqueio</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Audit History Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Histórico de Overrides
              </CardTitle>
              <CardDescription>
                Registro de todas as ações manuais realizadas neste tenant
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhuma ação de override registrada</p>
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
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {log.event_type.replace('BILLING_OVERRIDE_', '')}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(log.created_at)}
                              </span>
                            </div>
                            {log.metadata?.reason && (
                              <p className="text-sm mt-2">
                                <span className="font-medium">Motivo:</span> {log.metadata.reason}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                              {log.metadata?.previous_status && (
                                <span>
                                  Status anterior: <code>{log.metadata.previous_status}</code>
                                </span>
                              )}
                              {log.metadata?.new_status && (
                                <span>
                                  Novo status: <code>{log.metadata.new_status}</code>
                                </span>
                              )}
                              {log.metadata?.days && (
                                <span>
                                  Dias: <code>{log.metadata.days}</code>
                                </span>
                              )}
                              {log.metadata?.until_date && (
                                <span>
                                  Até: <code>{log.metadata.until_date}</code>
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
                <Label htmlFor="days">Dias a adicionar</Label>
                <Input
                  id="days"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                />
              </div>
            )}

            {currentAction === 'mark-as-paid' && (
              <div className="space-y-2">
                <Label htmlFor="untilDate">Válido até</Label>
                <Input
                  id="untilDate"
                  type="date"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (obrigatório)</Label>
              <Textarea
                id="reason"
                placeholder="Descreva o motivo desta ação..."
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
              Cancelar
            </Button>
            <Button
              onClick={executeAction}
              disabled={actionLoading || !reason.trim()}
              variant={currentAction === 'block-tenant' ? 'destructive' : 'default'}
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
