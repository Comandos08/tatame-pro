import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Clock, CreditCard, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface TenantBilling {
  id: string;
  status: string;
  plan_name: string;
  current_period_end: string | null;
  cancel_at: string | null;
}

const statusConfig: Record<string, { 
  variant: 'default' | 'destructive'; 
  icon: React.ElementType; 
  title: string;
  showBanner: boolean;
}> = {
  ACTIVE: { 
    variant: 'default', 
    icon: CheckCircle, 
    title: 'Assinatura ativa',
    showBanner: false, // Don't show banner for active
  },
  TRIALING: { 
    variant: 'default', 
    icon: Clock, 
    title: 'Período de trial',
    showBanner: true,
  },
  PAST_DUE: { 
    variant: 'destructive', 
    icon: AlertCircle, 
    title: 'Pagamento em atraso',
    showBanner: true,
  },
  CANCELED: { 
    variant: 'destructive', 
    icon: XCircle, 
    title: 'Assinatura cancelada',
    showBanner: true,
  },
  INCOMPLETE: { 
    variant: 'destructive', 
    icon: Clock, 
    title: 'Assinatura incompleta',
    showBanner: true,
  },
  UNPAID: { 
    variant: 'destructive', 
    icon: AlertCircle, 
    title: 'Assinatura não paga',
    showBanner: true,
  },
};

export function BillingStatusBanner() {
  const { tenant } = useTenant();
  const { hasRole, currentUser } = useCurrentUser();

  // Check if user can see billing info (admin or staff of this tenant)
  const canSeeBilling = tenant?.id && currentUser && (
    hasRole('ADMIN_TENANT', tenant.id) || 
    hasRole('STAFF_ORGANIZACAO', tenant.id) ||
    hasRole('SUPERADMIN_GLOBAL')
  );

  const { data: billing, isLoading } = useQuery({
    queryKey: ['tenant-billing-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      const { data, error } = await supabase
        .from('tenant_billing')
        .select('id, status, plan_name, current_period_end, cancel_at')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as TenantBilling | null;
    },
    enabled: !!tenant?.id && !!canSeeBilling,
  });

  // Only show to admins/staff
  if (!canSeeBilling) return null;
  
  // Still loading
  if (isLoading) return null;

  // No billing record yet - show warning
  if (!billing) {
    return (
      <Alert variant="destructive" className="mb-6">
        <CreditCard className="h-4 w-4" />
        <AlertTitle>Assinatura não configurada</AlertTitle>
        <AlertDescription>
          Esta organização ainda não possui uma assinatura ativa. 
          Entre em contato com o suporte para ativar sua assinatura.
        </AlertDescription>
      </Alert>
    );
  }

  const config = statusConfig[billing.status];
  
  // Don't show banner for active subscriptions
  if (!config?.showBanner) return null;

  const Icon = config.icon;
  const periodEnd = billing.current_period_end 
    ? new Date(billing.current_period_end).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const getDescription = () => {
    switch (billing.status) {
      case 'TRIALING':
        return `Seu período de trial termina em ${periodEnd}. Após essa data, será necessário efetuar o pagamento.`;
      case 'PAST_DUE':
        return 'O pagamento da sua assinatura está em atraso. Por favor, regularize para evitar suspensão.';
      case 'CANCELED':
        return 'Sua assinatura foi cancelada. Entre em contato com o suporte para reativar.';
      case 'INCOMPLETE':
        return 'Sua assinatura está incompleta. Por favor, complete o pagamento para ativar.';
      case 'UNPAID':
        return 'Sua assinatura está suspensa por falta de pagamento. Entre em contato para regularizar.';
      default:
        return 'Status da assinatura requer atenção.';
    }
  };

  return (
    <Alert variant={config.variant} className="mb-6">
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {config.title}
        <Badge variant="outline" className="ml-2 text-xs">
          {billing.plan_name}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        {getDescription()}
        {periodEnd && billing.status !== 'CANCELED' && (
          <span className="block mt-1 text-sm opacity-80">
            Válido até: {periodEnd}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
