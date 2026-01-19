import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Loader2, ExternalLink, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge, StatusType } from '@/components/ui/status-badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
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

type PlanType = 'monthly' | 'annual';

// Map billing status to StatusBadge status type
const billingStatusMap: Record<string, StatusType> = {
  ACTIVE: 'ACTIVE',
  TRIALING: 'TRIALING',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELLED',
  INCOMPLETE: 'INCOMPLETE',
  UNPAID: 'UNPAID',
};

export function TenantBillingDialog({ tenant, open, onOpenChange }: TenantBillingDialogProps) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');

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
    mutationFn: async (planType: PlanType) => {
      setIsCreating(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('create-tenant-subscription', {
        body: { tenantId: tenant.id, planType },
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
      queryClient.invalidateQueries({ queryKey: ['admin-billing'] });
      
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

  const handleOpenCustomerPortal = async () => {
    if (!billing?.stripe_customer_id) {
      toast.error('Este tenant não possui um cliente Stripe configurado');
      return;
    }
    
    setIsOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
        body: { tenant_id: tenant.id },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('URL do portal não retornada');
      }
    } catch (err) {
      console.error('Error opening customer portal:', err);
      toast.error('Erro ao abrir portal Stripe');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const statusType = billing?.status ? billingStatusMap[billing.status] || 'neutral' : 'neutral';

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
                <StatusBadge status={statusType} showDot />
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

            <div className="flex flex-col gap-2">
              {billing.stripe_customer_id && (
                <Button 
                  variant="outline"
                  className="w-full" 
                  onClick={handleOpenCustomerPortal}
                  disabled={isOpeningPortal}
                >
                  {isOpeningPortal ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Abrir portal Stripe
                </Button>
              )}

              {(billing.status === 'CANCELED' || billing.status === 'INCOMPLETE') && (
                <Button 
                  className="w-full" 
                  onClick={() => createSubscriptionMutation.mutate(selectedPlan)}
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
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium mt-3">Sem assinatura ativa</p>
              <p className="text-sm text-muted-foreground">
                Escolha o plano para esta organização
              </p>
            </div>

            <RadioGroup
              value={selectedPlan}
              onValueChange={(value) => setSelectedPlan(value as PlanType)}
              className="grid gap-3"
            >
              <Label 
                htmlFor="plan-monthly"
                className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${selectedPlan === 'monthly' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
              >
                <RadioGroupItem value="monthly" id="plan-monthly" />
                <div className="flex-1">
                  <span className="font-medium">Plano Mensal</span>
                  <p className="text-sm text-muted-foreground">Cobrança mensal, cancele quando quiser</p>
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </Label>

              <Label 
                htmlFor="plan-annual"
                className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${selectedPlan === 'annual' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
              >
                <RadioGroupItem value="annual" id="plan-annual" />
                <div className="flex-1">
                  <span className="font-medium">Plano Anual</span>
                  <p className="text-sm text-muted-foreground">Economia com cobrança anual</p>
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </Label>
            </RadioGroup>

            <Button 
              className="w-full"
              onClick={() => createSubscriptionMutation.mutate(selectedPlan)}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Criar assinatura {selectedPlan === 'monthly' ? 'mensal' : 'anual'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
