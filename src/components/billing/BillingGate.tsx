/**
 * BillingGate - Unified access control based on billing status
 *
 * PI B2 — Consumes TenantFlagsContract as canonical source
 *
 * MODELO A (ATUAL):
 * - tenant.status !== 'ACTIVE' → Ignore billing (show children)
 * - ACTIVE | TRIALING → Allow
 * - UNKNOWN → Allow (billing not yet configured)
 * - PAST_DUE → Partial block (warning or strict block)
 * - BLOCKED → Full block
 *
 * FAIL-CLOSED:
 * - contract not loaded → loader
 * - contract null → block
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
  const { t } = useI18n();
  const navigate = useNavigate();

  const isTenantActive = tenant?.status === "ACTIVE";
  const billingStatus = contract?.billing.status ?? null;

  /**
   * SHOULD BLOCK LOGIC (Modelo A)
   */
  const shouldBlock = useMemo(() => {
    if (!isTenantActive) return false;
    if (isContractLoading) return false;

    // Fail-closed if contract missing
    if (!contract) return true;

    // Only BLOCKED blocks fully
    return billingStatus === "BLOCKED";
  }, [isTenantActive, isContractLoading, contract, billingStatus]);

  /**
   * Navigation side-effect (never during render)
   */
  useEffect(() => {
    if (!shouldBlock) return;
    navigate(`/${tenant?.slug}/app/billing`, { replace: true });
  }, [shouldBlock, navigate, tenant?.slug]);

  /**
   * Ignore billing for non-active tenants (SETUP etc.)
   */
  if (!isTenantActive) {
    return <>{children}</>;
  }

  /**
   * Loader while contract loads
   */
  if (isContractLoading) {
    return <LoadingState titleKey="common.loading" />;
  }

  /**
   * Allowed states (Modelo A)
   */
  if (billingStatus === "ACTIVE" || billingStatus === "TRIALING" || billingStatus === "UNKNOWN") {
    return <>{children}</>;
  }

  /**
   * Explicit blocked state
   */
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

  /**
   * Read-only state (PAST_DUE)
   */
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

  /**
   * Final fail-safe (should never happen)
   */
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
