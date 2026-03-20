import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileCheck, Calendar, DollarSign, AlertCircle } from "lucide-react";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardMetrics {
  total_athletes: number;
  pending_approvals: number;
  upcoming_events: number;
  mrr_cents: number;
  memberships_by_month: Array<{ month: string; count: number }>;
}

interface TenantDashboardCardsProps {
  tenantId: string;
}

export function TenantDashboardCards({ tenantId }: TenantDashboardCardsProps) {
  const { data: metrics, isLoading, isError } = useQuery({
    queryKey: ["dashboard-metrics", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_tenant_dashboard_metrics",
        { p_tenant_id: tenantId }
      );

      if (error) {
        logger.error("[DASHBOARD] Error fetching dashboard metrics:", error);
        throw error;
      }

      return data as unknown as DashboardMetrics;
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span>Erro ao carregar métricas</span>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Atletas Ativos</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics?.total_athletes || 0}</div>
          <p className="text-xs text-muted-foreground">Com filiação válida</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes de Aprovação</CardTitle>
          <FileCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics?.pending_approvals || 0}</div>
          <p className="text-xs text-muted-foreground">Filiações aguardando</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Eventos Próximos</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics?.upcoming_events || 0}</div>
          <p className="text-xs text-muted-foreground">Nos próximos 7 dias</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Receita (30 dias)</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(metrics?.mrr_cents || 0)}</div>
          <p className="text-xs text-muted-foreground">De taxas de filiação</p>
        </CardContent>
      </Card>
    </div>
  );
}
