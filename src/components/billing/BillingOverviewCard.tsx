/**
 * BillingOverviewCard — Display current billing state with CTAs
 *
 * P3.3 — Billing UX Advanced Layer
 */

import React from "react";
import { logger } from "@/lib/logger";
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Trash2,
  XCircle,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTenantStatus } from "@/hooks/useTenantStatus";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantFlags } from "@/contexts/TenantFlagsContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { safeStripeRedirect } from "@/lib/stripeRedirect";
import { resolveBillingCTA, resolveBillingStatusVariant } from "./billingCtaResolver";
import type { BillingStatus } from "@/lib/billing/resolveTenantBillingState";

interface BillingOverviewCardProps {
  className?: string;
}

const statusIcons: Record<BillingStatus, React.ElementType> = {
  TRIALING: Clock,
  TRIAL_EXPIRED: AlertTriangle,
  ACTIVE: CheckCircle,
  PAST_DUE: AlertCircle,
  PENDING_DELETE: Trash2,
  CANCELED: XCircle,
  UNPAID: AlertCircle,
  INCOMPLETE: CreditCard,
};

const variantStyles = {
  success: { bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
  warning: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  destructive: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  muted: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};

export function BillingOverviewCard({ className }: BillingOverviewCardProps) {
  const { tenant } = useTenant();
  const { billingState, daysToTrialEnd, planName, isLoading } = useTenantStatus();
  const { contract } = useTenantFlags();
  const { t } = useI18n();
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  const hasBillingRecord = contract?.billing?.has_billing_record === true;

  if (!tenant) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="h-10 w-full bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (tenant.status !== "ACTIVE") {
    return (
      <Card className={cn("overflow-hidden", className)} data-testid="billing-card" data-billing-status="not-active">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-muted">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("billing.overview.title")}</CardTitle>
              <CardDescription>{t("billing.overview.notAvailableDescription")}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!isLoading && !hasBillingRecord) {
    return (
      <Card className={cn("overflow-hidden", className)} data-testid="billing-card" data-billing-status="setup">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-50">
              <CreditCard className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("billing.overview.title")}</CardTitle>
              <CardDescription>{t("billing.setup.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Button
            variant="default"
            onClick={async () => {
              if (!tenant?.id) return;
              setIsRedirecting(true);
              try {
                const { data, error } = await supabase.functions.invoke("create-tenant-subscription", {
                  body: { tenantId: tenant.id }, // CORRETO (esta Edge aceita camelCase)
                });

                if (error) throw error;
                if (data?.url && !safeStripeRedirect(data.url)) {
                  toast.error("URL de pagamento inválida");
                  setIsRedirecting(false);
                  return;
                }
              } catch (err) {
                logger.error("[BILLING] Failed to create checkout session:", err);
                toast.error(t("billing.error.checkoutFailed"));
                setIsRedirecting(false);
              }
            }}
            disabled={isRedirecting}
            className="w-full sm:w-auto"
            data-testid="billing-setup-cta"
          >
            {isRedirecting ? (
              <span className="animate-pulse">{t("common.loading")}</span>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("billing.setup.cta")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = billingState?.status ?? null;

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="h-10 w-full bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className={cn("overflow-hidden", className)} data-testid="billing-card" data-billing-status="empty">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-muted">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("billing.overview.title")}</CardTitle>
              <CardDescription>{t("billing.overview.noData")}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const variant = resolveBillingStatusVariant(status);
  const cta = resolveBillingCTA(status);
  const styles = variantStyles[variant];
  const StatusIcon = statusIcons[status] || CreditCard;

  const getStatusDescription = (): string => {
    switch (status) {
      case "TRIALING":
        return t("billing.overview.trialDaysLeft", {
          days: String(daysToTrialEnd ?? 0),
        });
      case "ACTIVE":
        return t("billing.overview.active", {
          plan: planName || "Growth",
        });
      default:
        return t(`billing.status.${status.toLowerCase()}`);
    }
  };

  const handleCTAClick = async () => {
    if (!cta || !tenant?.id) return;

    if (cta.action === "upgrade" || cta.action === "reactivate") {
      setIsRedirecting(true);
      try {
        const { data, error } = await supabase.functions.invoke("create-tenant-subscription", {
          body: { tenantId: tenant.id }, // CORRETO
        });

        if (error) throw error;
        if (data?.url && !safeStripeRedirect(data.url)) {
          toast.error("URL de pagamento inválida");
          setIsRedirecting(false);
          return;
        }
      } catch (err) {
        logger.error("Failed to create checkout session:", err);
        toast.error(t("billing.error.checkoutFailed"));
        setIsRedirecting(false);
      }
    } else if (cta.action === "manage") {
      setIsRedirecting(true);
      try {
        const { data, error } = await supabase.functions.invoke("tenant-customer-portal", {
          body: { tenant_id: tenant.id }, // 🔥 CORREÇÃO AQUI
        });

        if (error) throw error;
        if (data?.url && !safeStripeRedirect(data.url)) {
          toast.error("URL de pagamento inválida");
          setIsRedirecting(false);
          return;
        }
      } catch (err) {
        logger.error("Failed to open customer portal:", err);
        toast.error(t("billing.error.portalFailed"));
        setIsRedirecting(false);
      }
    }
  };

  const billingSource = billingState?.source === "MANUAL_OVERRIDE" ? "MANUAL" : "STRIPE";

  return (
    <Card
      className={cn("overflow-hidden", className)}
      data-testid="billing-card"
      data-billing-status={status}
      data-billing-source={billingSource}
    >
      <CardHeader className={cn("border-b", styles.border)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-full", styles.bg)}>
              <StatusIcon className={cn("h-5 w-5", styles.text)} />
            </div>
            <div>
              <CardTitle className="text-lg">{t("billing.overview.title")}</CardTitle>
              <CardDescription>{getStatusDescription()}</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{status}</Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {cta && (
          <Button variant={cta.variant} onClick={handleCTAClick} disabled={isRedirecting} className="w-full sm:w-auto">
            {isRedirecting ? (
              <span className="animate-pulse">{t("common.loading")}</span>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t(cta.labelKey)}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default BillingOverviewCard;
