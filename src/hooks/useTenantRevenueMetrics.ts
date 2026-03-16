import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantRevenueMetrics {
  total_memberships: number;
  total_fee_paid: number;
  total_fee_pending: number;
  revenue_cents: number;
  conversion_rate: number;
}

export function useTenantRevenueMetrics(tenantId: string) {
  return useQuery<TenantRevenueMetrics>({
    queryKey: ["tenant-revenue-metrics", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_tenant_revenue_metrics_v1",
        { p_tenant_id: tenantId }
      );

      if (error) {
        throw error;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("Revenue metrics returned null");
      }

      const row = data[0];
      return row satisfies TenantRevenueMetrics;
    },
    refetchInterval: 30000,
    staleTime: 30000,
  });
}
