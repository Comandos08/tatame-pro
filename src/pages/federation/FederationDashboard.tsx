/**
 * PI-D5-FEDERATION1.0 — Federation Dashboard (READ-ONLY)
 * 
 * Read-only dashboard for federation administrators.
 * Shows aggregated data from linked tenants.
 * 
 * NO destructive actions allowed on this page.
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Building2, FileText, Users, Scale, 
  Shield, Clock, AlertTriangle, Activity
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { LoadingState } from '@/components/ux';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function FederationDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { currentUser, isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();

  // Fetch federation data
  const { data: federation, isLoading: fedLoading, error: fedError } = useQuery({
    queryKey: ['federation', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('federations')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error('Federation not found');
      return data;
    },
    enabled: !!slug && !authLoading,
  });

  // Fetch federation tenants
  const { data: tenants } = useQuery({
    queryKey: ['federation-tenants', federation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('federation_tenants')
        .select(`
          tenant_id,
          joined_at,
          left_at,
          tenant:tenants(id, name, slug, is_active, created_at)
        `)
        .eq('federation_id', federation!.id)
        .is('left_at', null);
      
      if (error) throw error;
      return data;
    },
    enabled: !!federation?.id,
  });

  // Fetch councils
  const { data: councils } = useQuery({
    queryKey: ['federation-councils', federation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('councils')
        .select('id, name, description, created_at')
        .eq('federation_id', federation!.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!federation?.id,
  });

  // Fetch recent decisions
  const { data: recentDecisions } = useQuery({
    queryKey: ['federation-decisions', federation?.id],
    queryFn: async () => {
      const councilIds = councils?.map(c => c.id) || [];
      if (councilIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('council_decisions')
        .select(`
          id, decision_type, title, status, created_at,
          council:councils(name)
        `)
        .in('council_id', councilIds)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: !!councils && councils.length > 0,
  });

  // Fetch aggregated document stats (from tenants)
  const { data: docStats } = useQuery({
    queryKey: ['federation-doc-stats', tenants],
    queryFn: async () => {
      if (!tenants || tenants.length === 0) return { issued: 0, revoked: 0 };
      
      const tenantIds = tenants.map(t => t.tenant_id);
      
      const [cardsRes, diplomasRes] = await Promise.all([
        supabase
          .from('digital_cards')
          .select('id, status', { count: 'exact' })
          .in('tenant_id', tenantIds),
        supabase
          .from('diplomas')
          .select('id, status', { count: 'exact' })
          .in('tenant_id', tenantIds),
      ]);

      const cards = cardsRes.data || [];
      const diplomas = diplomasRes.data || [];

      const issued = cards.filter(c => c.status === 'ACTIVE').length + 
                     diplomas.filter(d => d.status === 'ISSUED').length;
      const revoked = cards.filter(c => c.status === 'REVOKED').length + 
                      diplomas.filter(d => d.status === 'REVOKED').length;

      return { issued, revoked };
    },
    enabled: !!tenants && tenants.length > 0,
  });

  // Fetch federation audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ['federation-audit', federation?.id],
    queryFn: async () => {
      if (!tenants || tenants.length === 0) return [];
      
      const tenantIds = tenants.map(t => t.tenant_id);
      
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, event_type, tenant_id, created_at, category')
        .in('tenant_id', tenantIds)
        .in('category', ['FEDERATION', 'COUNCIL'])
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    },
    enabled: !!tenants && tenants.length > 0,
  });

  // Check access
  const { data: hasAccess } = useQuery({
    queryKey: ['federation-access', federation?.id, currentUser?.id],
    queryFn: async () => {
      if (isGlobalSuperadmin) return true;
      
      const { data } = await supabase
        .from('federation_roles')
        .select('id')
        .eq('federation_id', federation!.id)
        .eq('user_id', currentUser!.id)
        .maybeSingle();
      
      return !!data;
    },
    enabled: !!federation?.id && !!currentUser?.id,
  });

  if (authLoading || fedLoading) {
    return <LoadingState titleKey="common.loading" variant="fullscreen" />;
  }

  if (fedError || !federation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Federação não encontrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              A federação solicitada não existe ou você não tem permissão para acessá-la.
            </p>
            <Button onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAccess && !isGlobalSuperadmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="h-5 w-5" />
              Acesso negado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Você não possui permissão para acessar o dashboard desta federação.
            </p>
            <Button onClick={() => navigate('/portal')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColor = federation.status === 'ACTIVE' 
    ? 'bg-success/10 text-success border-success/20' 
    : 'bg-destructive/10 text-destructive border-destructive/20';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/admin')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display text-lg font-bold flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                {federation.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                Dashboard Federativo (read-only)
              </p>
            </div>
          </div>
          <Badge variant="outline" className={statusColor}>
            {federation.status}
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Stats Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Tenants Vinculados</CardTitle>
                <Building2 className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{tenants?.length || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Documentos Emitidos</CardTitle>
                <FileText className="h-5 w-5 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{docStats?.issued || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Documentos Revogados</CardTitle>
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{docStats?.revoked || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Conselhos</CardTitle>
                <Users className="h-5 w-5 text-info" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{councils?.length || 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Tenants List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Tenants Vinculados
                </CardTitle>
                <CardDescription>
                  Organizações que fazem parte desta federação
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tenants && tenants.length > 0 ? (
                  <div className="space-y-3">
                    {tenants.map((ft) => {
                      const tenant = ft.tenant as { id: string; name: string; slug: string; is_active: boolean } | null;
                      if (!tenant) return null;
                      
                      return (
                        <div 
                          key={ft.tenant_id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        >
                          <div>
                            <p className="font-medium">{tenant.name}</p>
                            <p className="text-xs text-muted-foreground">/{tenant.slug}</p>
                          </div>
                          <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                            {tenant.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum tenant vinculado
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent Decisions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  Últimas Deliberações
                </CardTitle>
                <CardDescription>
                  Decisões recentes dos conselhos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentDecisions && recentDecisions.length > 0 ? (
                  <div className="space-y-3">
                    {recentDecisions.map((decision) => {
                      const statusColors: Record<string, string> = {
                        OPEN: 'bg-warning/10 text-warning border-warning/20',
                        APPROVED: 'bg-success/10 text-success border-success/20',
                        REJECTED: 'bg-destructive/10 text-destructive border-destructive/20',
                      };
                      
                      return (
                        <div 
                          key={decision.id}
                          className="p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{decision.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {decision.decision_type} • {(decision.council as { name: string } | null)?.name}
                              </p>
                            </div>
                            <Badge variant="outline" className={statusColors[decision.status] || ''}>
                              {decision.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {format(new Date(decision.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhuma deliberação registrada
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Audit Trail */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Eventos de Auditoria Federativos
              </CardTitle>
              <CardDescription>
                Últimos eventos relacionados à federação
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs && auditLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Categoria</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.event_type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.category}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum evento de auditoria federativo
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
