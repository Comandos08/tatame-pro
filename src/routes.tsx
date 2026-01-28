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
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import Help from "@/pages/Help";
import AuthCallback from "@/pages/AuthCallback";
import PortalRouter from "@/pages/PortalRouter";
import IdentityWizard from "@/pages/IdentityWizard";
import { IdentityErrorPage } from "@/components/identity/IdentityErrorScreen";

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
    <Routes>
      {/* ================= PUBLIC ================= */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/help" element={<Help />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* ================= IDENTITY ================= */}
      <Route
        path="/identity/wizard"
        element={
          <IdentityGate>
            <IdentityWizard />
          </IdentityGate>
        }
      />
      <Route path="/identity/error" element={<IdentityErrorPage />} />

      <Route path="/join/*" element={<Navigate to="/identity/wizard" replace />} />

      {/* ================= PORTAL ================= */}
      <Route
        path="/portal/*"
        element={
          <IdentityGate>
            <PortalRouter />
          </IdentityGate>
        }
      />

      {/* ================= ADMIN ================= */}
      <Route
        path="/admin"
        element={
          <IdentityGate>
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          </IdentityGate>
        }
      />

      {/* ================= TENANT ================= */}
      <Route path="/:tenantSlug" element={<TenantLayout />}>
        <Route index element={<TenantLanding />} />
        <Route
          path="app"
          element={
            <IdentityGate>
              <RequireRoles allowed={ACCESS_MATRIX.TENANT_APP}>
                <TenantDashboard />
              </RequireRoles>
            </IdentityGate>
          }
        />
        <Route
          path="app/memberships"
          element={
            <IdentityGate>
              <RequireRoles allowed={ACCESS_MATRIX.TENANT_MEMBERSHIPS}>
                <MembershipList />
              </RequireRoles>
            </IdentityGate>
          }
        />
        <Route
          path="app/memberships/:membershipId"
          element={
            <IdentityGate>
              <RequireRoles allowed={ACCESS_MATRIX.TENANT_MEMBERSHIPS}>
                <MembershipDetails />
              </RequireRoles>
            </IdentityGate>
          }
        />
      </Route>

      {/* ================= FALLBACK ================= */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
