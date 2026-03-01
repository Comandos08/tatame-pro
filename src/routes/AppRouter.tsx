import { Routes, Route } from "react-router-dom";

import TenantDashboard from "@/pages/TenantDashboard";
import AthleteArea from "@/pages/AthleteArea";
import AthletesList from "@/pages/AthletesList";
import AthleteGradingsPage from "@/pages/AthleteGradingsPage";
import MembershipList from "@/pages/MembershipList";
import MembershipDetails from "@/pages/MembershipDetails";
import AcademiesList from "@/pages/AcademiesList";
import CoachesList from "@/pages/CoachesList";
import GradingSchemesList from "@/pages/GradingSchemesList";
import GradingLevelsList from "@/pages/GradingLevelsList";
import ApprovalsList from "@/pages/ApprovalsList";
import ApprovalDetails from "@/pages/ApprovalDetails";
import InternalRankings from "@/pages/InternalRankings";
import EventsList from "@/pages/EventsList";
import EventDetails from "@/pages/EventDetails";
import AuditLog from "@/pages/AuditLog";
import SecurityTimeline from "@/pages/SecurityTimeline";
import TenantBilling from "@/pages/TenantBilling";
import TenantSettings from "@/pages/TenantSettings";
import TenantOnboarding from "@/pages/TenantOnboarding";
import TenantHelp from "@/pages/TenantHelp";
import TenantDiagnostics from "@/pages/TenantDiagnostics";
import NotFound from "@/pages/NotFound";

import { BillingGate } from "@/components/billing/BillingGate";
import { RequireFeature } from "@/components/auth/RequireFeature";
import { RequireRoles } from "@/components/auth/RequireRoles";

export default function AppRouter() {
  return (
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
            <TenantDiagnostics />
          </RequireRoles>
        }
      />

      {/* ONBOARDING (SEM ROLE GATE) */}
      <Route path="onboarding" element={<TenantOnboarding />} />

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
  );
}
