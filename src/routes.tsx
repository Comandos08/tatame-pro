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
import Help from "@/pages/Help";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";

import IdentityWizard from "@/pages/IdentityWizard";
import PortalRouter from "@/pages/PortalRouter";
import AdminDashboard from "@/pages/AdminDashboard";
import TenantControl from "@/pages/TenantControl";

// Layout
import { TenantLayout } from "@/layouts/TenantLayout";
import TenantLanding from "@/pages/TenantLanding";
import TenantDashboard from "@/pages/TenantDashboard";

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

export function AppRoutes() {
  return (
    <Routes>
      {/* ================= PUBLIC ================= */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/help" element={<Help />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* ================= IDENTITY ================= */}
      <Route
        path="/identity/*"
        element={
          <IdentityGate>
            <Routes>
              <Route path="wizard" element={<IdentityWizard />} />
              <Route path="*" element={<Navigate to="wizard" replace />} />
            </Routes>
          </IdentityGate>
        }
      />

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
        path="/admin/*"
        element={
          <IdentityGate>
            <AdminRoute>
              <Routes>
                <Route index element={<AdminDashboard />} />
                <Route path="tenants/:tenantId/control" element={<TenantControl />} />
              </Routes>
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
            <RequireRoles allowed={ACCESS_MATRIX.TENANT_APP}>
              <TenantDashboard />
            </RequireRoles>
          }
        />
      </Route>

      {/* ================= FALLBACK ================= */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
