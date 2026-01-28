import { Routes, Route } from "react-router-dom";
import IdentityGate from "@/components/identity/IdentityGate";

// Public pages
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Help from "@/pages/Help";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";

// Identity
import IdentityWizard from "@/pages/IdentityWizard";

// Portal
import PortalRouter from "@/pages/PortalRouter";

// Admin
import AdminDashboard from "@/pages/AdminDashboard";
import TenantControl from "@/pages/TenantControl";

// Tenant
import { TenantLayout } from "@/layouts/TenantLayout";
import TenantLanding from "@/pages/TenantLanding";
import TenantDashboard from "@/pages/TenantDashboard";

export default function App() {
  return (
    <IdentityGate>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/help" element={<Help />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Identity */}
        <Route path="/identity/wizard" element={<IdentityWizard />} />

        {/* Portal */}
        <Route path="/portal/*" element={<PortalRouter />} />

        {/* Admin (Superadmin only - protected by IdentityGate R5) */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/tenants/:tenantId/control" element={<TenantControl />} />

        {/* Tenant routes */}
        <Route path="/:tenantSlug" element={<TenantLayout />}>
          <Route index element={<TenantLanding />} />
          <Route path="app" element={<TenantDashboard />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </IdentityGate>
  );
}
