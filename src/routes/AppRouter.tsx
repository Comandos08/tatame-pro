import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { BillingGate } from "@/components/billing/BillingGate";
import { RequireFeature } from "@/components/auth/RequireFeature";
import { RequireRoles } from "@/components/auth/RequireRoles";

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

export default function AppRouter() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
        {/* DASHBOARD */}
        <Route
          index
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_DASHBOARD">
                <TenantDashboard />
              </RequireFeature>
            </RequireRoles>
          }
        />

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

        {/* ACADEMIES */}
        <Route
          path="academies"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_ACADEMIES">
                <AcademiesList />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* COACHES */}
        <Route
          path="coaches"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_COACHES">
                <CoachesList />
              </RequireFeature>
            </RequireRoles>
          }
        />

        {/* GRADINGS */}
        <Route
          path="grading-schemes"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_GRADINGS">
                <GradingSchemesList />
              </RequireFeature>
            </RequireRoles>
          }
        />

        <Route
          path="grading-schemes/:schemeId/levels"
          element={
            <RequireRoles allowed={["ADMIN_TENANT", "STAFF_ORGANIZACAO"]}>
              <RequireFeature featureKey="TENANT_GRADINGS">
                <GradingLevelsList />
              </RequireFeature>
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
