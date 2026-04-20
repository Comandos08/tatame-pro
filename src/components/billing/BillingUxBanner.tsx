/**
 * BILLING UX SAFE GOLD — v1.1
 *
 * Deterministic billing status banner.
 * NO redirects. NO side effects. NO mutations.
 * Only renders when billing ≠ ACTIVE.
 */

import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, XCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import type { BillingState, BillingViewState } from '@/types/billing-view-state';
import { safeOpen } from '@/lib/safeOpen';

interface BillingUxBannerProps {
  billingState: BillingState;
  billingViewState: BillingViewState;
}

const BANNER_CONFIG: Record<BillingState, {
  icon: React.ElementType;
  variant: 'default' | 'destructive';
  titleKey: string;
  descriptionKey: string;
  ctaKey: string;
  ctaAction: 'portal' | 'contact';
} | null> = {
  ACTIVE: null, // No banner for active
  INCOMPLETE: {
    icon: AlertTriangle,
    variant: 'default',
    titleKey: 'billing.ux.incompleteTitle',
    descriptionKey: 'billing.ux.incompleteDescription',
    ctaKey: 'billing.ux.completPayment',
    ctaAction: 'portal',
  },
  PAST_DUE: {
    icon: AlertCircle,
    variant: 'destructive',
    titleKey: 'billing.ux.pastDueTitle',
    descriptionKey: 'billing.ux.pastDueDescription',
    ctaKey: 'billing.ux.updatePayment',
    ctaAction: 'portal',
  },
  UNPAID: {
    icon: AlertCircle,
    variant: 'destructive',
    titleKey: 'billing.ux.unpaidTitle',
    descriptionKey: 'billing.ux.unpaidDescription',
    ctaKey: 'billing.ux.goToBilling',
    ctaAction: 'portal',
  },
  CANCELED: {
    icon: XCircle,
    variant: 'destructive',
    titleKey: 'billing.ux.canceledTitle',
    descriptionKey: 'billing.ux.canceledDescription',
    ctaKey: 'billing.ux.contactSupport',
    ctaAction: 'contact',
  },
};

export function BillingUxBanner({ billingState, billingViewState }: BillingUxBannerProps) {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);

  const config = BANNER_CONFIG[billingState];

  // Don't render for ACTIVE state
  if (!config) return null;

  const handleCta = async () => {
    if (config.ctaAction === 'contact') {
      // Open mailto or support page
      safeOpen('mailto:suporte@tatame.pro');
      return;
    }

    // Open Stripe Customer Portal
    if (!tenant?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
        body: { tenant_id: tenant.id },
      });

      if (error) throw error;
      if (data?.url) {
        safeOpen(data.url);
      } else {
        throw new Error('Portal URL not returned');
      }
    } catch (err) {
      logger.error('Error opening customer portal:', err);
      toast.error(t('billing.openPortalError'));
    } finally {
      setIsLoading(false);
    }
  };

  const Icon = config.icon;

  // Fallback messages if i18n keys don't exist
  const titleFallbacks: Record<BillingState, string> = {
    ACTIVE: '',
    INCOMPLETE: 'Pagamento não concluído',
    PAST_DUE: 'Pagamento em atraso',
    UNPAID: 'Pagamento não realizado',
    CANCELED: 'Assinatura cancelada',
  };

  const descFallbacks: Record<BillingState, string> = {
    ACTIVE: '',
    INCOMPLETE: 'Complete seu pagamento para continuar usando todos os recursos.',
    PAST_DUE: 'Atualize suas informações de pagamento para evitar interrupções.',
    UNPAID: 'Acesse a área de faturamento para regularizar sua situação.',
    CANCELED: 'Entre em contato com o suporte para reativar sua assinatura.',
  };

  const ctaFallbacks: Record<BillingState, string> = {
    ACTIVE: '',
    INCOMPLETE: 'Concluir pagamento',
    PAST_DUE: 'Atualizar pagamento',
    UNPAID: 'Ir para faturamento',
    CANCELED: 'Entrar em contato',
  };

  const title = t(config.titleKey) || titleFallbacks[billingState];
  const description = t(config.descriptionKey) || descFallbacks[billingState];
  const ctaText = t(config.ctaKey) || ctaFallbacks[billingState];

  return (
    <Alert
      variant={config.variant}
      className="mb-6"
      data-testid="billing-ux-banner"
      data-billing-state={billingState}
      data-billing-view-state={billingViewState}
    >
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{description}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCta}
          disabled={isLoading}
          data-testid="billing-ux-cta"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-2" />
          )}
          {ctaText}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
