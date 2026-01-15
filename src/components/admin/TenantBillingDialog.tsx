import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Loader2, Calendar, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TenantBillingDialogProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    stripe_customer_id?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TenantBilling {
  id: string;
  tenant_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_name: string;
  plan_price_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  ACTIVE: { label: 'Ativo', variant: 'default', icon: CheckCircle },
  TRIALING: { label: 'Trial', variant: 'secondary', icon: Clock },
  PAST_DUE: { label: 'Em atraso', variant: 'destructive', icon: AlertCircle },
  CANCELED: { label: 'Cancelado', variant: 'destructive', icon: XCircle },
  INCOMPLETE: { label: 'Incompleto', variant: 'outline', icon: Clock },
  UNPAID: { label: 'Não pago', variant: 'destructive', icon: AlertCircle },
};

export function TenantBillingDialog({ tenant, open, onOpenChange }: TenantBillingDialogProps) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const { data: billing, isLoading } = useQuery({
    queryKey: ['tenant-billing', tenant.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_billing')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as TenantBilling | null;
    },
    enabled: open,
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async () => {
      setIsCreating(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('create-tenant-subscription', {
        body: { tenantId: tenant.id },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar assinatura');
      }

      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Assinatura criada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['tenant-billing', tenant.id] });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      
      if (data.clientSecret) {
        toast.info('O tenant precisará completar o pagamento para ativar a assinatura.');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar assinatura');
    },
    onSettled: () => {
      setIsCreating(false);
    },
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const statusInfo = billing?.status ? statusConfig[billing.status] : null;
  const StatusIcon = statusInfo?.icon || Clock;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing - {tenant.name}
          </DialogTitle>
          <DialogDescription>
            Gerencie a assinatura e faturamento da organização
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : billing ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plano</span>
                <span className="font-medium">{billing.plan_name}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={statusInfo?.variant || 'outline'} className="flex items-center gap-1">
                  <StatusIcon className="h-3 w-3" />
                  {statusInfo?.label || billing.status}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Período atual</span>
                <span className="text-sm">
                  {formatDate(billing.current_period_start)} - {formatDate(billing.current_period_end)}
                </span>
              </div>

              {billing.cancel_at && (
                <div className="flex items-center justify-between text-destructive">
                  <span className="text-sm">Cancela em</span>
                  <span className="text-sm font-medium">{formatDate(billing.cancel_at)}</span>
                </div>
              )}

              {billing.stripe_subscription_id && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">ID Stripe</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {billing.stripe_subscription_id.slice(0, 20)}...
                  </code>
                </div>
              )}
            </div>

            {(billing.status === 'CANCELED' || billing.status === 'INCOMPLETE') && (
              <Button 
                className="w-full" 
                onClick={() => createSubscriptionMutation.mutate()}
                disabled={isCreating}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Reativar assinatura
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <CreditCard className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Sem assinatura ativa</p>
              <p className="text-sm text-muted-foreground">
                Esta organização ainda não possui uma assinatura configurada.
              </p>
            </div>
            <Button 
              onClick={() => createSubscriptionMutation.mutate()}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Criar assinatura anual
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
