import { lazy, Suspense, ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { BillingGate } from "@/components/billing/BillingGate";
import { RequireFeature } from "@/components/auth/RequireFeature";
import { RequireRoles } from "@/components/auth/RequireRoles";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantRoles } from "@/hooks/useTenantRoles";
import { useOnboardingStatus } from "@/components/onboarding/TenantOnboardingGate";

/**
 * OnboardingBypassFeature — durante o wizard de onboarding (tenant em SETUP),
 * bypassa o RequireFeature para as rotas de configuração obrigatórias.
 * RequireRoles permanece intacto em todas as rotas.
 */
function OnboardingBypassFeature({
  featureKey,
  children,
}: {
  featureKey: string;
  children: ReactNode;
}) {
  const { isComplete, isSetupMode, isLoading } = useOnboardingStatus();
  // Durante loading, não bypassar — aguardar resolução
  if (!isLoading && !isComplete && isSetupMode) {
    return <>{children}</>;
  }
  return <RequireFeature featureKey={featureKey}>{children}</RequireFeature>;
}

const TenantDashboard     = lazy(() => import("@/pages/TenantDashboard"));
const AthleteArea         = lazy(() => import("@/pages/AthleteArea"));
const AthletesList        = lazy(() => import("@/pages/AthletesList"));
const AthleteImport       = lazy(() => import("@/pages/AthleteImport"));
const AthleteGradingsPage = lazy(() => import("@/pages/AthleteGradingsPage"));
const MembershipList      = lazy(() => import("@/pages/MembershipList"));
const MembershipDetails   = lazy(() => import("@/pages/MembershipDetails"));
const AcademiesList       = lazy(() => import("@/pages/AcademiesList"));
const CoachesList         = lazy(() => import("@/pages/CoachesList"));
const GradingSchemesList  = lazy(() => import("@/pages/GradingSchemesList"));
const GradingLevelsList   = lazy(() => import("@/pages/GradingLevelsList"));
const ApprovalsList       = lazy(() => import("@/pages/ApprovalsList"));
const ApprovalDetails     = lazy(() => import("@/pages/ApprovalDetails"));
const InternalRankings    = lazy(() => import("@/pages/InternalRankings"));
const EventsList          = lazy(() => import("@/pages/EventsList"));
const EventDetails        = lazy(() => import("@/pages/EventDetails"));
const AuditLog            = lazy(() => import("@/pages/AuditLog"));
const SecurityTimeline    = lazy(() => import("@/pages/SecurityTimeline"));
const TenantBilling       = lazy(() => import("@/pages/TenantBilling"));
const TenantSettings      = lazy(() => import("@/pages/TenantSettings"));
const TenantOnboarding    = lazy(() => import("@/pages/TenantOnboarding"));
const TenantHelp          = lazy(() => import("@/pages/TenantHelp"));
const TenantDiagnostics   = lazy(() => import("@/pages/TenantDiagnostics"));
const NotFound            = lazy(() => import("@/pages/NotFound"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

/**
 * Smart index route for /:tenantSlug/app.
 *
 * ATLETA users who land here (e.g. from a bookmark or stale redirect) are sent
 * to their portal instead of seeing AccessDenied. Admin/staff users proceed to
 * the normal dashboard with RequireRoles enforcement.
 *
 * BY DESIGN: The role check is lightweight (cached via useTenantRoles) and only
 * redirects pure ATLETA users — any overlap with ADMIN_TENANT or STAFF_ORGANIZACAO
 * keeps the admin path.
 */
function AppIndexRoute() {
  const { tenant } = useTenant();
  const { roles, isLoading } = useTenantRoles(tenant?.id);

  if (isLoading) return <PageLoader />;

  const isAtleta =
    roles.includes('ATLETA') &&
    !roles.includes('ADMIN_TENANT') &&
    !roles.includes('STAFF_ORGANIZACAO');

  if (isAtleta) {
    return <Navigate to={`/${tenant?.slug}/portal`} replace />;
  }

  return (
    <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
      <RequireFeature featureKey="TENANT_DASHBOARD">
        <TenantDashboard />
      </RequireFeature>
    </RequireRoles>
  );
}

export default function AppRouter() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
        {/* DASHBOARD — AppIndexRoute handles ATLETA redirect to portal */}
        <Route index element={<AppIndexRoute />} />

        {/* MY AREA (ATLETA + STAFF + ADMIN) */}
        <Route
          path="me"
          element={
            <RequireRoles
              allowed={[
                "ATLETA",
                "ADMIN_TENANT",
                "STAFF_ORGANIZACAO",
                "COACH_PRINCIPAL",
                "COACH_ASSISTENTE",
                "INSTRUTOR",
              ]}
            >
              <RequireFeature featureKey="TENANT_MY_AREA">
                <AthleteArea />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* ATHLETES */}
        <Route
          path="athletes"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_ATHLETES">
                <AthletesList />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="athletes/import"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_ATHLETES">
                <AthleteImport />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="athletes/:athleteId/gradings"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_ATHLETES">
                <AthleteGradingsPage />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* MEMBERSHIPS */}
        <Route
          path="memberships"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_MEMBERSHIPS">
                <MembershipList />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="memberships/:membershipId"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_MEMBERSHIPS">
                <MembershipDetails />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* ACADEMIES — OnboardingBypassFeature permite acesso durante wizard de setup */}
        <Route
          path="academies"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <OnboardingBypassFeature featureKey="TENANT_ACADEMIES">
                <AcademiesList />
              </OnboardingBypassFeature>
            </RequireRoles>
          }
        />

        {/* COACHES — OnboardingBypassFeature permite acesso durante wizard de setup */}
        <Route
          path="coaches"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <OnboardingBypassFeature featureKey="TENANT_COACHES">
                <CoachesList />
              </OnboardingBypassFeature>
            </RequireRoles>
          }
        />

        {/* GRADINGS — OnboardingBypassFeature permite acesso durante wizard de setup */}
        <Route
          path="grading-schemes"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <OnboardingBypassFeature featureKey="TENANT_GRADINGS">
                <GradingSchemesList />
              </OnboardingBypassFeature>
            </RequireRoles>
          }
        />

        <Route
          path="grading-schemes/:schemeId/levels"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <OnboardingBypassFeature featureKey="TENANT_GRADINGS">
                <GradingLevelsList />
              </OnboardingBypassFeature>
            </RequireRoles>
          }
        />

        {/* APPROVALS */}
        <Route
          path="approvals"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_APPROVALS">
                <ApprovalsList />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="approvals/:approvalId"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_APPROVALS">
                <ApprovalDetails />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* RANKINGS */}
        <Route
          path="rankings"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_RANKINGS">
                <InternalRankings />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* EVENTS (BillingGate mantido) */}
        <Route
          path="events"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_EVENTS">
                <BillingGate strictMode>
                  <EventsList />
                </BillingGate>
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="events/:eventId"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_EVENTS">
                <BillingGate strictMode>
                  <EventDetails />
                </BillingGate>
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* ADMIN ONLY */}
        <Route
          path="audit-log"
          element={
            <RequireRoles allowed={["ADMIN_TENANT"]}>
              <RequireFeature featureKey="TENANT_AUDIT_LOG">
                <AuditLog />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="security"
          element={
            <RequireRoles allowed={["ADMIN_TENANT"]}>
              <RequireFeature featureKey="TENANT_SECURITY">
                <SecurityTimeline />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="billing"
          element={
            <RequireRoles allowed={["ADMIN_TENANT"]}>
              <RequireFeature featureKey="TENANT_BILLING">
                <TenantBilling />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="settings"
          element={
            <RequireRoles allowed={["ADMIN_TENANT"]}>
              <RequireFeature featureKey="TENANT_SETTINGS">
                <TenantSettings />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="diagnostics"
          element={
            <RequireRoles allowed={["ADMIN_TENANT"]}>
              <RequireFeature featureKey="TENANT_DIAGNOSTICS">
                <TenantDiagnostics />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* ONBOARDING */}
        <Route
          path="onboarding"
          element={
            <RequireRoles allowed={["ADMIN_TENANT"]}>
              <TenantOnboarding />
            </RequireRoles>
          }
        />

        {/* HELP */}
        <Route
          path="help"
          element={
            <RequireRoles allowed={["ATLETA", "ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_HELP">
                <TenantHelp />
              </RequireFeature>
            </RequireRoles>
          }
        />

          {/* FALLBACK */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
