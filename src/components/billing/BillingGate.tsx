/**
 * BillingGate - Unified access control based on billing status
 *
 * PI B2 — Now consumes TenantFlagsContract as canonical source
 *
 * LOGIC:
 * - tenant.status !== 'ACTIVE' → Ignore billing (show children)
 * - contract.billing.status in ['TRIALING', 'ACTIVE'] → Allow (show children)
 * - contract.billing.status === 'PAST_DUE' → Partial block (show warning + children)
 * - contract.billing.status in ['BLOCKED', 'UNKNOWN'] → Full block
 *
 * FAIL-CLOSED: contract not loaded → loader (never allow through)
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

  // B2: Use contract billing status for blocking decisions
  const billingStatus = contract?.billing.status ?? null;

  const shouldBlock = useMemo(() => {
    if (!isTenantActive) return false;
    if (isContractLoading) return false;
    if (!contract) return true; // B2 fail-closed: no contract = block

    return billingStatus === "BLOCKED" || billingStatus === "UNKNOWN";
  }, [isTenantActive, isContractLoading, contract, billingStatus]);

  // Navigate via useEffect, never during render
  useEffect(() => {
    if (!shouldBlock) return;
    navigate(`/${tenant?.slug}/app/billing`, { replace: true });
  }, [shouldBlock, navigate, tenant?.slug]);

  // Ignore billing for non-ACTIVE tenants (still in SETUP)
  if (!isTenantActive) {
    return <>{children}</>;
  }

  // B2 fail-closed: block while contract loads
  if (isContractLoading) {
    return <LoadingState titleKey="common.loading" />;
  }

  // Allowed states - full access
  if (billingStatus === "ACTIVE" || billingStatus === "TRIALING") {
    return <>{children}</>;
  }

  // Blocked states (BLOCKED, UNKNOWN, or no contract)
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

    // Non-strict mode: show warning banner + children
    return (
      <>
        <BillingWarningBanner status={billingStatus} tenantSlug={tenant?.slug} />
        {children}
      </>
    );
  }

  // Default: allow access
  return <>{children}</>;
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
