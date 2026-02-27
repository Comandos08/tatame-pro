import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle, Clock, DollarSign, TrendingUp } from "lucide-react";
import { useTenantRevenueMetrics } from "@/hooks/useTenantRevenueMetrics";

interface TenantRevenueCardsProps {
  tenantId: string;
}

function getConversionVariant(rate: number): "default" | "secondary" | "destructive" | "outline" {
  if (rate >= 80) return "default";
  if (rate >= 50) return "secondary";
  return "destructive";
}

function getConversionLabel(rate: number): string {
  if (rate >= 80) return "Saudável";
  if (rate >= 50) return "Atenção";
  return "Crítico";
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function TenantRevenueCards({ tenantId }: TenantRevenueCardsProps) {
  const { data: metrics, isLoading, error } = useTenantRevenueMetrics(tenantId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    const isForbidden =
      error instanceof Error &&
      (error.message.includes("P0001") || error.message.includes("FORBIDDEN"));

    return (
      <Card className="border-destructive/50">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-destructive font-medium">
            {isForbidden ? "Acesso restrito" : "Erro ao carregar métricas de receita"}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total de Filiações
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total_memberships}</div>
          <p className="text-xs text-muted-foreground">Base total do tenant</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pagas
          </CardTitle>
          <CheckCircle className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total_fee_paid}</div>
          <p className="text-xs text-muted-foreground">Com pagamento confirmado</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pendentes
          </CardTitle>
          <Clock className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total_fee_pending}</div>
          <p className="text-xs text-muted-foreground">Aguardando pagamento</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Receita Total
          </CardTitle>
          <DollarSign className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {currencyFormatter.format(metrics.revenue_cents / 100)}
          </div>
          <p className="text-xs text-muted-foreground">Somatório de taxas pagas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Conversão
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              {metrics.conversion_rate.toFixed(2)}%
            </span>
            <Badge variant={getConversionVariant(metrics.conversion_rate)}>
              {getConversionLabel(metrics.conversion_rate)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">Taxas pagas / total</p>
        </CardContent>
      </Card>
    </div>
  );
}
