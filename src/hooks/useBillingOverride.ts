/**
 * SAFE GOLD — ETAPA 2
 * Hook para verificar status de billing override do tenant
 */

import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';

interface BillingOverrideStatus {
  isManualOverride: boolean;
  overrideReason: string | null;
  overrideAt: Date | null;
  canUseStripe: boolean;
  isLoading: boolean;
}

export function useBillingOverride(): BillingOverrideStatus {
  const { tenant } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ['billing-override', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      const { data, error } = await supabase
        .from('tenant_billing')
        .select('is_manual_override, override_reason, override_at')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching billing override:', error);
        return null;
      }
      
      return data;
    },
    enabled: !!tenant?.id,
    staleTime: 60000, // 1 minuto de cache
  });

  const isManualOverride = data?.is_manual_override ?? false;

  return {
    isManualOverride,
    overrideReason: data?.override_reason ?? null,
    overrideAt: data?.override_at ? new Date(data.override_at) : null,
    canUseStripe: !isManualOverride,
    isLoading,
  };
}
