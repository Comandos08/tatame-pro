import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { RequireRoles } from "@/components/auth/RequireRoles";
import { ACCESS_MATRIX } from "@/lib/accessMatrix";
import { IdentityGate } from "@/components/identity/IdentityGate";
import { useCurrentUser } from "@/contexts/AuthContext";
import { AccessDenied } from "@/components/auth/AccessDenied";

// Pages
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import TenantLanding from "@/pages/TenantLanding";
import TenantDashboard from "@/pages/TenantDashboard";
import MembershipList from "@/pages/MembershipList";
import MembershipDetails from "@/pages/MembershipDetails";
import MembershipStatus from "@/pages/MembershipStatus";
import MembershipRenew from "@/pages/MembershipRenew";
import AcademiesList from "@/pages/AcademiesList";
import CoachesList from "@/pages/CoachesList";
import ApprovalsList from "@/pages/ApprovalsList";
import ApprovalDetails from "@/pages/ApprovalDetails";
import GradingSchemesList from "@/pages/GradingSchemesList";
import GradingLevelsList from "@/pages/GradingLevelsList";
import AthleteGradingsPage from "@/pages/AthleteGradingsPage";
import AthletesList from "@/pages/AthletesList";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyCard from "@/pages/VerifyCard";
import VerifyDiploma from "@/pages/VerifyDiploma";
import VerifyMembership from "@/pages/VerifyMembership";
import NotFound from "@/pages/NotFound";
import Help from "@/pages/Help";
import TenantHelp from "@/pages/TenantHelp";
import AuditLog from "@/pages/AuditLog";
import SecurityTimeline from "@/pages/SecurityTimeline";
import PublicAcademies from "@/pages/PublicAcademies";
import PublicRankings from "@/pages/PublicRankings";
import InternalRankings from "@/pages/InternalRankings";
import TenantSettings from "@/pages/TenantSettings";
import TenantBilling from "@/pages/TenantBilling";
import AthleteArea from "@/pages/AthleteArea";
import TenantControl from "@/pages/TenantControl";
import AthletePortal from "@/pages/AthletePortal";
import TenantOnboarding from "@/pages/TenantOnboarding";
import PortalEvents from "@/pages/PortalEvents";
import PortalCard from "@/pages/PortalCard";
import EventsList from "@/pages/EventsList";
import EventDetails from "@/pages/EventDetails";
import PublicEventsList from "@/pages/PublicEventsList";
import PublicEventDetails from "@/pages/PublicEventDetails";
import AuthCallback from "@/pages/AuthCallback";
import AthleteLogin from "@/pages/AthleteLogin";
import PortalRouter from "@/pages/PortalRouter";

// Identity
import IdentityWizard from "@/pages/IdentityWizard";
import { IdentityErrorPage } from "@/components/identity/IdentityErrorScreen";

// Membership
import { MembershipTypeSelector } from "@/components/membership/MembershipTypeSelector";
import { AdultMembershipForm } from "@/components/membership/AdultMembershipForm";
import { YouthMembershipForm } from "@/components/membership/YouthMembershipForm";
import { MembershipSuccess } from "@/components/membership/MembershipSuccess";

// Layout
import { TenantLayout } from "@/layouts/TenantLayout";

/**
 * 🔐 AdminRoute — Global Superadmin Only
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isGlobalSuperadmin, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isGlobalSuperadmin) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <IdentityGate>
      <Routes>
        {/* ================= PUBLIC ================= */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/help" element={<Help />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* ================= IDENTITY ================= */}
        <Route path="/identity/wizard" element={<IdentityWizard />} />
        <Route path="/identity/error" element={<IdentityErrorPage />} />

        <Route path="/join/*" element={<Navigate to="/identity/wizard" replace />} />

        {/* ================= PORTAL HUB ================= */}
        <Route path="/portal" element={<PortalRouter />} />

        {/* ================= ADMIN ================= */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/tenants/:tenantId/control"
          element={
            <AdminRoute>
              <TenantControl />
            </AdminRoute>
          }
        />

        {/* ================= TENANT ================= */}
        <Route path="/:tenantSlug" element={<TenantLayout />}>
          {/* Public tenant */}
          <Route index element={<TenantLanding />} />
          <Route path="login" element={<AthleteLogin />} />
          <Route path="verify/card/:cardId" element={<VerifyCard />} />
          <Route path="verify/diploma/:diplomaId" element={<VerifyDiploma />} />
          <Route path="verify/membership/:membershipId" element={<VerifyMembership />} />
          <Route path="academies" element={<PublicAcademies />} />
          <Route path="rankings" element={<PublicRankings />} />
          <Route path="events" element={<PublicEventsList />} />
          <Route path="events/:eventId" element={<PublicEventDetails />} />

          {/* Membership public */}
          <Route path="membership/new" element={<MembershipTypeSelector />} />
          <Route path="membership/adult" element={<AdultMembershipForm />} />
          <Route path="membership/youth" element={<YouthMembershipForm />} />
          <Route path="membership/success" element={<MembershipSuccess />} />

          {/* Athlete portal */}
          <Route
            path="portal"
            element={
              <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL}>
                <AthletePortal />
              </RequireRoles>
            }
          />
          <Route
            path="portal/events"
            element={
              <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL_EVENTS}>
                <PortalEvents />
              </RequireRoles>
            }
          />
          <Route
            path="portal/card"
            element={
              <RequireRoles allowed={ACCESS_MATRIX.ATHLETE_PORTAL_CARD}>
                <PortalCard />
              </RequireRoles>
            }
          />

          {/* Tenant app */}
          <Route
            path="app"
            element={
              <RequireRoles allowed={ACCESS_MATRIX.TENANT_APP}>
                <TenantDashboard />
              </RequireRoles>
            }
          />

          <Route path="app/*" element={<TenantDashboard />} />
        </Route>

        {/* ================= FALLBACK ================= */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </IdentityGate>
  );
}
