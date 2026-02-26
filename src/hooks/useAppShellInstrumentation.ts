/**
 * 📊 AppShell Instrumentation Hook
 *
 * Extraído do AppShell para separação de concerns.
 * Calcula todos os data-attributes de E2E determinísticos.
 * Puramente declarativo — não altera comportamento.
 */

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useTenant } from "@/contexts/TenantContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { assertTenantLifecycleState } from "@/domain/tenant/normalize";
import { normalizeBillingState, deriveBillingViewState } from "@/domain/billing/normalizeBillingUx";
import { deriveReportMode } from "@/domain/reports/normalize";
import {
  isReportsRoute as checkIsReportsRoute,
  normalizeReportsViewState,
  deriveActiveReportType,
} from "@/domain/reports/normalizeReports";
import { normalizeExportViewState, isExportRoute } from "@/domain/exports/normalize";
import {
  isAnalyticsRoute,
  deriveActiveMetrics,
  normalizeAnalyticsViewState as normalizeAnalyticsState,
} from "@/domain/analytics/normalize";
import { normalizeAuditViewState } from "@/domain/audit/normalize";
import { useTenantStatus } from "@/hooks/useTenantStatus";
import { resolveUXPersona } from "@/lib/ux/resolveUXPersona";

export function useAppShellInstrumentation() {
  const { tenant } = useTenant();
  const { isImpersonating, isLoading: impersonationLoading, resolutionStatus } = useImpersonation();
  const { role: identityRole } = useIdentity();
  const { isGlobalSuperadmin } = useCurrentUser();
  const { billingStatus } = useTenantStatus();
  const location = useLocation();
  const pathname = location.pathname;

  // -------------------------
  // Impersonation
  // -------------------------
  const impersonationViewState =
    impersonationLoading || resolutionStatus === "RESOLVING"
      ? "LOADING"
      : resolutionStatus === "RESOLVED" || !impersonationLoading
        ? "READY"
        : "ERROR";

  const impersonationState = isImpersonating ? "ON" : "OFF";

  // -------------------------
  // Tenant lifecycle
  // -------------------------
  const tenantLifecycleState = assertTenantLifecycleState(tenant?.status);

  // -------------------------
  // Admin
  // -------------------------
  const adminMode = pathname.includes("/admin") ? "ON" : "OFF";

  const adminViewState =
    adminMode === "ON" ? (impersonationLoading || resolutionStatus === "RESOLVING" ? "LOADING" : "READY") : "READY";

  const adminRole = isGlobalSuperadmin ? "SUPERADMIN_GLOBAL" : "NONE";

  // -------------------------
  // Billing
  // -------------------------
  const billingState = normalizeBillingState(billingStatus);
  const billingViewState = deriveBillingViewState(billingState);

  // -------------------------
  // Reports
  // -------------------------
  const isReportsRoute =
    pathname.includes("/reports") || pathname.includes("/analytics") || pathname.includes("/dashboard");

  const reportMode = deriveReportMode(tenant?.id, isGlobalSuperadmin && !tenant?.id);

  const reportViewState = isReportsRoute ? "READY" : "";

  const isOnReportsRoute = checkIsReportsRoute(pathname);
  const reportsViewState = normalizeReportsViewState(isOnReportsRoute ? { ready: true } : null);
  const reportsType = deriveActiveReportType(pathname);
  const reportsContext = isOnReportsRoute ? "ACTIVE" : "";

  // -------------------------
  // Exports
  // -------------------------
  const isOnExportRoute = isExportRoute(pathname);
  const exportViewState = normalizeExportViewState(isOnExportRoute ? "READY" : null);
  const exportType = isOnExportRoute ? (pathname.includes("/pdf") ? "PDF" : "CSV") : "";

  // -------------------------
  // Analytics
  // -------------------------
  const isOnAnalyticsRoute = isAnalyticsRoute(pathname);
  const analyticsViewState = normalizeAnalyticsState(isOnAnalyticsRoute ? { ready: true } : null);
  const analyticsMetrics = deriveActiveMetrics(pathname);

  // -------------------------
  // Audit
  // -------------------------
  const isAuditRoute = pathname.includes("/audit");
  const auditViewState = normalizeAuditViewState(isAuditRoute ? { ready: true } : null);
  const auditEntity = isAuditRoute ? "TENANT" : "";
  const auditLevel = "INFO";

  // -------------------------
  // UX Persona
  // -------------------------
  const uxPersona = useMemo(() => resolveUXPersona(identityRole), [identityRole]);

  return {
    uxPersona,
    dataAttributes: {
      "data-testid": "app-shell",
      "data-impersonation-state": impersonationState,
      "data-impersonation-view-state": impersonationViewState,
      "data-tenant-state": tenantLifecycleState,
      "data-tenant-id": tenant?.id ?? "",
      "data-admin-mode": adminMode,
      "data-admin-view-state": adminViewState,
      "data-admin-role": adminRole,
      "data-admin-route": pathname,
      "data-billing-state": billingState,
      "data-billing-view-state": billingViewState,
      "data-report-mode": reportMode,
      "data-report-view-state": reportViewState,
      "data-report-route": isReportsRoute ? pathname : "",
      "data-reports-context": reportsContext,
      "data-reports-view-state": reportsViewState,
      "data-reports-type": isOnReportsRoute ? reportsType : "",
      "data-reports-route": isOnReportsRoute ? pathname : "",
      "data-export-type": exportType,
      "data-export-view-state": exportViewState,
      "data-export-route": isOnExportRoute ? pathname : "",
      "data-analytics-view-state": analyticsViewState,
      "data-analytics-metrics": analyticsMetrics.join(","),
      "data-analytics-route": isOnAnalyticsRoute ? pathname : "",
      "data-audit-context": isAuditRoute ? "ACTIVE" : "",
      "data-audit-view-state": auditViewState,
      "data-audit-entity": auditEntity,
      "data-audit-level": auditLevel,
      "data-audit-route": isAuditRoute ? pathname : "",
    },
  };
}
