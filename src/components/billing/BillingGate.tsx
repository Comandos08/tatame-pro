/**
 * BillingGate - Unified access control based on billing status
 *
 * PI B2 — Consumes TenantFlagsContract as canonical source
 *
 * LOGIC (Modelo A — Onboarding Progressivo):
 * - tenant.status !== 'ACTIVE' → Ignore billing (show children)
 * - contract.billing.status in ['TRIALING', 'ACTIVE'] → Allow
 * - contract.billing.status === 'UNKNOWN' → Allow (billing not yet configured)
 * - contract.billing.status === 'PAST_DUE' → Partial block (warning or strict block)
 * - contract.billing.status === 'BLOCKED' → Full block
 *
 * FAIL-CLOSED:
 * - contract not loaded → loader
 * - contract is null after loading → block (fail-closed)
 *
 * MODELO A: UNKNOWN = "organização ainda não iniciou cobrança", NÃO "organização inválida"
 */

import React, { useEffect, useMemo } from "react";
import { CreditCard, AlertTriangle, Clock } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantFlags } from "@/contexts/TenantFlagsContext";
import { useI18n } from "@/contexts/I18nContext";
import { BlockedStateCard } from "@/components/ux/BlockedStateCard";
import { LoadingState } from "@/components/ux/LoadingState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface BillingGateProps {
  children: React.ReactNode;
  strictMode?: boolean;
  fallback?: React.ReactNode;
}

export function BillingGate({ children, strictMode = false, fallback }: BillingGateProps) {
  const { tenant } = useTenant();
  const { contract, isLoading: isContractLoading } = useTenantFlags();
  useI18n();
  const navigate = useNavigate();

  const isTenantActive = tenant?.status === "ACTIVE";
  const billingStatus = contract?.billing.status ?? null;

  const shouldBlock = useMemo(() => {
    if (!isTenantActive) return false;
    if (isContractLoading) return false;
    if (!contract) return true; // fail-closed

    // Modelo A: UNKNOWN = billing not yet configured, NOT blocked
    // Only BLOCKED triggers full block
    return billingStatus === "BLOCKED";
  }, [isTenantActive, isContractLoading, contract, billingStatus]);

  // Navigate via effect only (never during render)
  useEffect(() => {
    if (!shouldBlock) return;
    navigate(`/${tenant?.slug}/app/billing`, { replace: true });
  }, [shouldBlock, navigate, tenant?.slug]);

  // Ignore billing for non-ACTIVE tenants (e.g., SETUP)
  if (!isTenantActive) {
    return <>{children}</>;
  }

  // Fail-closed while contract loads
  if (isContractLoading) {
    return <LoadingState titleKey="common.loading" />;
  }

  // Allowed states
  if (billingStatus === "ACTIVE" || billingStatus === "TRIALING") {
    return <>{children}</>;
  }

  // Modelo A: UNKNOWN = billing not yet configured (no stripe customer, no billing record)
  // Tenant operates freely until billing is explicitly required
  if (billingStatus === "UNKNOWN") {
    return <>{children}</>;
  }

  // Explicit blocked states
  if (shouldBlock) {
    return (
      fallback || (
        <BlockedStateCard
          icon={CreditCard}
          iconVariant="destructive"
          titleKey="billing.gate.blocked.title"
          descriptionKey="billing.gate.blocked.description"
          actions={[
            {
              labelKey: "billing.gate.blocked.action",
              onClick: () => navigate(`/${tenant?.slug}/app/billing`),
              variant: "default",
            },
            {
              labelKey: "common.goBack",
              onClick: () => navigate(-1),
              variant: "outline",
            },
          ]}
        />
      )
    );
  }

  // Read-only state (PAST_DUE)
  if (billingStatus === "PAST_DUE") {
    if (strictMode) {
      return (
        fallback || (
          <BlockedStateCard
            icon={Clock}
            iconVariant="warning"
            titleKey="billing.gate.readonly.title"
            descriptionKey="billing.gate.readonly.description"
            actions={[
              {
                labelKey: "billing.gate.readonly.action",
                onClick: () => navigate(`/${tenant?.slug}/app/billing`),
                variant: "default",
              },
            ]}
          />
        )
      );
    }

    return (
      <>
        <BillingWarningBanner status={billingStatus} tenantSlug={tenant?.slug} />
        {children}
      </>
    );
  }

  // 🔒 FAIL-CLOSED DEFAULT
  return (
    fallback || (
      <BlockedStateCard
        icon={CreditCard}
        iconVariant="destructive"
        titleKey="billing.gate.blocked.title"
        descriptionKey="billing.gate.blocked.description"
        actions={[
          {
            labelKey: "billing.gate.blocked.action",
            onClick: () => navigate(`/${tenant?.slug}/app/billing`),
            variant: "default",
          },
          {
            labelKey: "common.goBack",
            onClick: () => navigate(-1),
            variant: "outline",
          },
        ]}
      />
    )
  );
}

interface BillingWarningBannerProps {
  status: string | null;
  tenantSlug?: string;
}

function BillingWarningBanner({ status, tenantSlug }: BillingWarningBannerProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  if (!status) return null;

  const getMessage = () => {
    switch (status) {
      case "PAST_DUE":
        return t("billing.gate.warning.pastDue");
      default:
        return t("billing.gate.warning.generic");
    }
  };

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("billing.gate.warning.title")}</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{getMessage()}</span>
        <Button variant="outline" size="sm" onClick={() => navigate(`/${tenantSlug}/app/billing`)}>
          {t("billing.gate.warning.action")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default BillingGate;
