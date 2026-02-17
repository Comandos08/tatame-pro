/**
 * 📊 MembershipObservability — PI-MEMBERSHIP-OBSERVABILITY-001
 * 
 * Operational observability for the Membership domain.
 * READ-ONLY — Zero mutations.
 * Access: SUPERADMIN_GLOBAL only (guarded via RequireGlobalRoles in App.tsx)
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Users, Clock, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface MembershipMetrics {
  draft_count: number;
  pending_payment_count: number;
  pending_review_count: number;
  approved_count: number;
  expired_count: number;
  cancelled_count: number;
  rejected_count: number;
  total_count: number;
  draft_over_24h: number;
  pending_payment_over_24h: number;
  pending_review_over_48h: number;
  p0_long_pending_review: number;
  p1_long_draft: number;
  p1_payment_stuck: number;
  avg_seconds_to_first_transition: number | null;
  avg_seconds_to_review: number | null;
}

function useMembershipMetrics() {
  return useQuery({
    queryKey: ['membership-operational-metrics'],
    queryFn: async (): Promise<MembershipMetrics> => {
      const { data, error } = await supabase.rpc('check_membership_operational_metrics_v1');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('No metrics returned');
      return row as MembershipMetrics;
    },
    refetchInterval: 30_000,
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

type Severity = 'ok' | 'warning' | 'critical';

function getSeverity(metrics: MembershipMetrics): Severity {
  if (metrics.p0_long_pending_review > 0) return 'critical';
  if (metrics.draft_over_24h > 0 || metrics.pending_review_over_48h > 0 || metrics.p1_long_draft > 0 || metrics.p1_payment_stuck > 0) return 'warning';
  return 'ok';
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = {
    ok: { label: 'Saudável', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    warning: { label: 'Atenção', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    critical: { label: 'Crítico', className: 'bg-red-500/10 text-red-600 border-red-500/20' },
  };
  const c = config[severity];
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

function MetricCard({ title, value, subtitle, icon: Icon, severity }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  severity?: Severity;
}) {
  const borderClass = severity === 'critical' 
    ? 'border-red-500/30' 
    : severity === 'warning' 
      ? 'border-amber-500/30' 
      : 'border-border';

  return (
    <Card className={cn('transition-colors', borderClass)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {severity && severity !== 'ok' && (
          <div className="mt-2">
            <SeverityBadge severity={severity} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MembershipObservability() {
  const navigate = useNavigate();
  const { data: metrics, isLoading, error, refetch } = useMembershipMetrics();

  const overallSeverity = metrics ? getSeverity(metrics) : 'ok';

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Activity className="h-6 w-6" />
                Observabilidade — Memberships
              </h1>
              <p className="text-muted-foreground text-sm">Métricas operacionais do domínio de filiações</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {metrics && <SeverityBadge severity={overallSeverity} />}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </motion.div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-6">
              <p className="text-destructive">Erro ao carregar métricas: {(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {metrics && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-8"
          >
            {/* Volume por Status */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Volume por Status
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <MetricCard title="Draft" value={metrics.draft_count} icon={Users} />
                <MetricCard title="Pend. Pagamento" value={metrics.pending_payment_count} icon={Users} />
                <MetricCard title="Pend. Revisão" value={metrics.pending_review_count} icon={Users} />
                <MetricCard title="Aprovadas" value={metrics.approved_count} icon={Users} />
                <MetricCard title="Expiradas" value={metrics.expired_count} icon={Users} />
                <MetricCard title="Canceladas" value={metrics.cancelled_count} icon={Users} />
                <MetricCard title="Rejeitadas" value={metrics.rejected_count} icon={Users} />
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Total: <span className="font-medium">{metrics.total_count}</span> memberships
              </div>
            </section>

            <Separator />

            {/* Aging Buckets */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Aging — Gargalos de Fluxo
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title="Draft > 24h"
                  value={metrics.draft_over_24h}
                  subtitle="Memberships em rascunho há mais de 24h"
                  icon={Clock}
                  severity={metrics.draft_over_24h > 0 ? 'warning' : 'ok'}
                />
                <MetricCard
                  title="Pend. Pagamento > 24h"
                  value={metrics.pending_payment_over_24h}
                  subtitle="Aguardando pagamento há mais de 24h"
                  icon={Clock}
                  severity={metrics.pending_payment_over_24h > 0 ? 'warning' : 'ok'}
                />
                <MetricCard
                  title="Pend. Revisão > 48h"
                  value={metrics.pending_review_over_48h}
                  subtitle="Aguardando revisão há mais de 48h"
                  icon={Clock}
                  severity={metrics.pending_review_over_48h > 0 ? 'warning' : 'ok'}
                />
              </div>
            </section>

            <Separator />

            {/* Anomalias Operacionais */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Anomalias Operacionais
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title="P0 — Revisão > 7 dias"
                  value={metrics.p0_long_pending_review}
                  subtitle="PENDING_REVIEW há mais de 7 dias"
                  icon={AlertTriangle}
                  severity={metrics.p0_long_pending_review > 0 ? 'critical' : 'ok'}
                />
                <MetricCard
                  title="P1 — Draft > 3 dias"
                  value={metrics.p1_long_draft}
                  subtitle="DRAFT há mais de 3 dias sem progresso"
                  icon={AlertTriangle}
                  severity={metrics.p1_long_draft > 0 ? 'warning' : 'ok'}
                />
                <MetricCard
                  title="P1 — Pagamento travado"
                  value={metrics.p1_payment_stuck}
                  subtitle="PENDING_PAYMENT há mais de 24h"
                  icon={AlertTriangle}
                  severity={metrics.p1_payment_stuck > 0 ? 'warning' : 'ok'}
                />
              </div>
            </section>

            <Separator />

            {/* Tempo Médio */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Tempo Médio entre Etapas
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricCard
                  title="Até primeira transição"
                  value={formatDuration(metrics.avg_seconds_to_first_transition)}
                  subtitle="Tempo médio do DRAFT até a primeira mudança de status"
                  icon={Activity}
                />
                <MetricCard
                  title="Até revisão"
                  value={formatDuration(metrics.avg_seconds_to_review)}
                  subtitle="Tempo médio até reviewed_at ser preenchido"
                  icon={Activity}
                />
              </div>
            </section>
          </motion.div>
        )}
      </div>
    </div>
  );
}
